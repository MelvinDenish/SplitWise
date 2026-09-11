package com.groupfinancetracker.service;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.entity.PaymentDispute;
import com.groupfinancetracker.entity.Share;
import com.groupfinancetracker.entity.User;
import com.groupfinancetracker.exception.ForbiddenActionException;
import com.groupfinancetracker.exception.NotFoundException;
import com.groupfinancetracker.repository.PaymentDisputeRepository;
import com.groupfinancetracker.repository.GroupRepository;
import com.groupfinancetracker.repository.ShareRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional
public class PaymentDisputeService {
    private final PaymentDisputeRepository paymentDisputeRepository;
    private final ShareRepository shareRepository;
    private final GroupRepository groupRepository;

    public DtoModels.PaymentDisputeResponse dispute(DtoModels.DisputePaymentRequest request, Long actorId) {
        if (actorId == null) throw new ForbiddenActionException("Authenticated user required");
        Share share = shareRepository.findById(request.shareId())
                .orElseThrow(() -> new NotFoundException("Share not found: " + request.shareId()));
        User payer = share.getSubEvent().getPayer();
        User debtor = share.getUser();
        if (!Objects.equals(actorId, payer.getId()) && !Objects.equals(actorId, debtor.getId())) {
            throw new ForbiddenActionException("Only the payer or payee can dispute this payment");
        }
        User raisedBy = Objects.equals(actorId, payer.getId()) ? payer : debtor;
        User against = Objects.equals(actorId, payer.getId()) ? debtor : payer;
        PaymentDispute dispute = paymentDisputeRepository.save(PaymentDispute.builder()
                .share(share)
                .raisedBy(raisedBy)
                .againstUser(against)
                .reason(request.reason())
                .status("OPEN")
                .createdAt(Instant.now())
                .build());
        return toDto(dispute);
    }

    public List<DtoModels.PaymentDisputeResponse> listByGroup(Long groupId, Long actorId) {
        var group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        boolean isMember = actorId != null && (Objects.equals(group.getCreator().getId(), actorId)
                || group.getMembers().stream().anyMatch(user -> Objects.equals(user.getId(), actorId)));
        if (!isMember) throw new ForbiddenActionException("Only group members can view disputes");
        return paymentDisputeRepository.findByGroupId(groupId).stream().map(this::toDto).toList();
    }

    private DtoModels.PaymentDisputeResponse toDto(PaymentDispute dispute) {
        return new DtoModels.PaymentDisputeResponse(
                dispute.getId(),
                dispute.getShare().getId(),
                dispute.getRaisedBy().getId(),
                dispute.getRaisedBy().getName(),
                dispute.getAgainstUser().getId(),
                dispute.getAgainstUser().getName(),
                dispute.getReason(),
                dispute.getStatus(),
                dispute.getCreatedAt(),
                dispute.getResolvedAt());
    }
}
