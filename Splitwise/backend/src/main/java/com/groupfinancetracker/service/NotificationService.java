package com.groupfinancetracker.service;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.entity.*;
import com.groupfinancetracker.exception.ForbiddenActionException;
import com.groupfinancetracker.exception.NotFoundException;
import com.groupfinancetracker.repository.*;
import com.groupfinancetracker.settlement.SettlementCalculator;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional
public class NotificationService {
    private static final String PAYMENT_REMINDER = "PAYMENT_REMINDER";

    private final NotificationRepository notificationRepository;
    private final ShareRepository shareRepository;
    private final GroupRepository groupRepository;
    private final UserRepository userRepository;
    private final SettlementRepository settlementRepository;
    private final EmailService emailService;

    public List<DtoModels.NotificationResponse> listForUser(Long actorId) {
        requireActor(actorId);
        return notificationRepository.findByRecipientId(actorId).stream()
                .map(this::toDto)
                .toList();
    }

    public long unreadCount(Long actorId) {
        requireActor(actorId);
        return notificationRepository.countByRecipient_IdAndReadAtIsNull(actorId);
    }

    public DtoModels.NotificationResponse markRead(Long notificationId, Long actorId) {
        requireActor(actorId);
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NotFoundException("Notification not found: " + notificationId));
        if (!Objects.equals(notification.getRecipient().getId(), actorId)) {
            throw new ForbiddenActionException("You can only update your own notifications");
        }
        if (notification.getReadAt() == null) {
            notification.setReadAt(Instant.now());
        }
        return toDto(notificationRepository.save(notification));
    }

    public DtoModels.NotificationResponse remindShare(DtoModels.ShareReminderRequest request, Long actorId) {
        requireActor(actorId);
        Share share = shareRepository.findById(request.shareId())
                .orElseThrow(() -> new NotFoundException("Share not found: " + request.shareId()));
        User payer = share.getSubEvent().getPayer();
        User debtor = share.getUser();
        if (!Objects.equals(payer.getId(), actorId)) {
            throw new ForbiddenActionException("Only the payer can remind this payee");
        }
        if (Objects.equals(payer.getId(), debtor.getId())) {
            throw new IllegalArgumentException("No reminder is needed for the payer's own share");
        }
        PaymentStatus status = share.getPaymentStatus();
        if (status != null && status.getStatus() == PaymentState.CONFIRMED) {
            throw new IllegalStateException("This share is already confirmed");
        }

        Group group = share.getSubEvent().getEvent().getGroup();
        String title = "Payment reminder from " + payer.getName();
        String fallback = "%s reminded you to pay ₹%s for %s in %s."
                .formatted(payer.getName(), share.getAmount(), share.getSubEvent().getDescription(), group.getName());
        return createReminder(debtor, payer, group, share, null, share.getAmount(), title,
                withOptionalMessage(fallback, request.message()));
    }

    public DtoModels.NotificationResponse remindPairwise(DtoModels.PairwiseReminderRequest request, Long actorId) {
        requireActor(actorId);
        Group group = groupRepository.findById(request.groupId())
                .orElseThrow(() -> new NotFoundException("Group not found: " + request.groupId()));
        if (!isMember(group, actorId)) {
            throw new ForbiddenActionException("Only group members can send reminders");
        }
        if (!Objects.equals(actorId, request.creditorId())) {
            throw new ForbiddenActionException("Only the creditor can remind the debtor");
        }

        User debtor = userRepository.findById(request.debtorId())
                .orElseThrow(() -> new NotFoundException("User not found: " + request.debtorId()));
        User creditor = userRepository.findById(request.creditorId())
                .orElseThrow(() -> new NotFoundException("User not found: " + request.creditorId()));
        if (!isMember(group, debtor.getId()) || !isMember(group, creditor.getId())) {
            throw new IllegalArgumentException("Both users must be members of the group");
        }

        boolean edgeExists = SettlementCalculator.simplifyOptimal(SettlementCalculator.netBalances(
                        debtRowsFor(group.getId()), settlementRowsFor(group.getId()))).stream()
                .anyMatch(edge -> Objects.equals(edge.fromId(), debtor.getId())
                        && Objects.equals(edge.toId(), creditor.getId())
                        && edge.amount().add(SettlementCalculator.EPSILON).compareTo(request.amount()) >= 0);
        if (!edgeExists) {
            throw new IllegalStateException("No matching outstanding settlement exists");
        }

        String title = "Settlement reminder from " + creditor.getName();
        String fallback = "%s reminded you to settle ₹%s in %s."
                .formatted(creditor.getName(), request.amount(), group.getName());
        return createReminder(debtor, creditor, group, null, null, request.amount(), title,
                withOptionalMessage(fallback, request.message()));
    }

    private DtoModels.NotificationResponse createReminder(User recipient, User sender, Group group, Share share,
            Settlement settlement, BigDecimal amount, String title, String message) {
        Notification notification = notificationRepository.save(Notification.builder()
                .recipient(recipient)
                .sender(sender)
                .group(group)
                .share(share)
                .settlement(settlement)
                .type(PAYMENT_REMINDER)
                .title(title)
                .message(message)
                .amount(amount)
                .createdAt(Instant.now())
                .build());
        emailService.sendPaymentReminder(recipient.getName(), recipient.getEmail(), sender.getName(),
                group != null ? group.getName() : "SplitWise", amount, message);
        return toDto(notification);
    }

    private List<SettlementCalculator.DebtRow> debtRowsFor(Long groupId) {
        return shareRepository.findBySubEvent_Event_Group_Id(groupId).stream()
                .map(share -> new SettlementCalculator.DebtRow(
                        share.getUser().getId(), share.getSubEvent().getPayer().getId(), share.getAmount()))
                .toList();
    }

    private List<SettlementCalculator.SettlementRow> settlementRowsFor(Long groupId) {
        return settlementRepository.findByGroup_Id(groupId).stream()
                .filter(st -> st.getStatus() == null || st.getStatus() == PaymentState.CONFIRMED)
                .map(st -> new SettlementCalculator.SettlementRow(
                        st.getFromUser().getId(), st.getToUser().getId(), st.getAmount()))
                .toList();
    }

    private String withOptionalMessage(String fallback, String message) {
        if (message == null || message.isBlank()) return fallback;
        return fallback + " Note: " + message.trim();
    }

    private boolean isMember(Group group, Long userId) {
        return userId != null && (Objects.equals(group.getCreator().getId(), userId)
                || group.getMembers().stream().anyMatch(user -> Objects.equals(user.getId(), userId)));
    }

    private void requireActor(Long actorId) {
        if (actorId == null) throw new ForbiddenActionException("Authenticated user required");
    }

    private DtoModels.NotificationResponse toDto(Notification notification) {
        return new DtoModels.NotificationResponse(
                notification.getId(),
                notification.getRecipient().getId(),
                notification.getSender().getId(),
                notification.getSender().getName(),
                notification.getGroup() != null ? notification.getGroup().getId() : null,
                notification.getGroup() != null ? notification.getGroup().getName() : null,
                notification.getShare() != null ? notification.getShare().getId() : null,
                notification.getSettlement() != null ? notification.getSettlement().getId() : null,
                notification.getType(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getAmount(),
                notification.getCreatedAt(),
                notification.getReadAt());
    }
}
