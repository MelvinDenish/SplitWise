package com.groupfinancetracker.service;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.entity.Group;
import com.groupfinancetracker.entity.PaymentState;
import com.groupfinancetracker.entity.Share;
import com.groupfinancetracker.entity.Settlement;
import com.groupfinancetracker.exception.NotFoundException;
import com.groupfinancetracker.repository.EventRepository;
import com.groupfinancetracker.repository.GroupRepository;
import com.groupfinancetracker.repository.ShareRepository;
import com.groupfinancetracker.repository.SettlementRepository;
import com.groupfinancetracker.settlement.SettlementCalculator;
import jakarta.transaction.Transactional;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class SettlementService {
    private final ShareRepository shareRepository;
    private final GroupRepository groupRepository;
    private final ShareService shareService;
    private final UserService userService;
    private final com.groupfinancetracker.repository.SubEventRepository subEventRepository;
    private final SettlementRepository settlementRepository;
    private final EventRepository eventRepository;

    public DtoModels.GroupSettlementSummary groupSummary(@NonNull Long groupId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        List<Share> shares = shareRepository.findBySubEvent_Event_Group_Id(groupId);
        List<Settlement> settlements = settlementRepository.findByGroup_Id(groupId);
        Map<Long, BigDecimal> net = SettlementCalculator.netBalances(toDebtRows(shares), toSettlementRows(settlements));
        int outstanding = (int) shares.stream()
                .filter(s -> s.getPaymentStatus() != null
                        && s.getPaymentStatus().getStatus() == PaymentState.MARKED_AS_PAID)
                .count();
        List<DtoModels.UserBalance> list = net.entrySet().stream()
                .filter(e -> e.getValue().abs().compareTo(SettlementCalculator.EPSILON) >= 0)
                .map(e -> new DtoModels.UserBalance(e.getKey(), e.getValue()))
                .sorted(Comparator.comparing(DtoModels.UserBalance::userId))
                .toList();
        return new DtoModels.GroupSettlementSummary(g.getId(), list, outstanding);
    }

    public DtoModels.GroupSettlementSummary groupSummary(@NonNull Long groupId, Long actorId) {
        requireGroupMember(groupId, actorId);
        return groupSummary(groupId);
    }

    // Itemized view only; net balances live in groupSummary (shares - settlements).
    public DtoModels.UserOutstandingDebts userDebts(@NonNull Long userId) {
        var shares = shareRepository.findByUser_IdAndPaymentStatus_StatusNot(userId, PaymentState.CONFIRMED);
        var debts = shares.stream().map(shareService::toDto).toList();
        return new DtoModels.UserOutstandingDebts(userId, debts);
    }

    public DtoModels.GroupPairwise groupPairwise(@NonNull Long groupId) {
        if (!groupRepository.existsById(groupId))
            throw new NotFoundException("Group not found: " + groupId);
        List<Share> shares = shareRepository.findBySubEvent_Event_Group_Id(groupId);
        List<Settlement> settlements = settlementRepository.findByGroup_Id(groupId);
        SettlementCalculator.OptimizationResult optimized = SettlementCalculator.optimize(
                toDebtRows(shares), toSettlementRows(settlements));
        List<DtoModels.PairwiseBalance> pairwiseBalances = toPairwiseBalances(optimized.edges(), "Optimized net balance");
        List<DtoModels.PairwiseBalance> rawPairwiseBalances = calculateRawPairwise(shares, settlements);

        List<DtoModels.PairwiseOwe> owes = new ArrayList<>();
        for (DtoModels.PairwiseBalance pb : pairwiseBalances) {
            owes.add(new DtoModels.PairwiseOwe(pb.user1Id(), pb.user2Id(), pb.amount(), pb.description()));
        }

        return new DtoModels.GroupPairwise(groupId, owes, pairwiseBalances, rawPairwiseBalances,
                toOptimizationDto(optimized));
    }

    public DtoModels.GroupPairwise groupPairwise(@NonNull Long groupId, Long actorId) {
        requireGroupMember(groupId, actorId);
        return groupPairwise(groupId);
    }

    public DtoModels.WeeklySettlementResponse weeklySettlements(@NonNull Long groupId, @NonNull Integer weekNumber,
            @NonNull Integer year, Long currentUserId) {
        if (!groupRepository.existsById(groupId))
            throw new NotFoundException("Group not found: " + groupId);
        List<Share> shares = shareRepository
                .findBySubEvent_Event_Group_IdAndSubEvent_WeekNumberAndSubEvent_Year(groupId, weekNumber, year);
        // Netted against ALL settlements in the group, not just ones tagged to this week's events --
        // a settlement recorded elsewhere (e.g. the group-level "Settle Up") must still count here.
        List<Settlement> settlements = settlementRepository.findByGroup_Id(groupId);

        List<DtoModels.PairwiseBalance> pairwise = calculateSimplifiedPairwise(shares, settlements);
        List<DtoModels.PairwiseBalance> rawPairwise = calculateRawPairwise(shares, settlements);

        List<DtoModels.ToPayEntry> toPay = new ArrayList<>();
        List<DtoModels.ToReceiveEntry> toReceive = new ArrayList<>();

        for (DtoModels.PairwiseBalance pb : pairwise) {
            if (currentUserId != null) {
                if (Objects.equals(currentUserId, pb.user1Id())) {
                    toPay.add(new DtoModels.ToPayEntry(pb.user2Id(), pb.user2(), pb.amount()));
                } else if (Objects.equals(currentUserId, pb.user2Id())) {
                    toReceive.add(new DtoModels.ToReceiveEntry(pb.user1Id(), pb.user1(), pb.amount()));
                }
            }
        }

        toPay.sort(Comparator.comparing(DtoModels.ToPayEntry::toUser));
        toReceive.sort(Comparator.comparing(DtoModels.ToReceiveEntry::fromUser));

        return new DtoModels.WeeklySettlementResponse(weekNumber, year, currentUserId, toPay, toReceive, pairwise, rawPairwise);
    }

    public DtoModels.EventSettlementResponse eventPairwise(@NonNull Long eventId) {
        var event = eventRepository.findById(eventId)
                .orElseThrow(() -> new NotFoundException("Event not found: " + eventId));
        List<Share> shares = shareRepository.findBySubEvent_Event_Id(eventId);
        // Netted against ALL settlements in the event's group, not just ones explicitly tagged to
        // this event -- a settlement recorded via the group-level "Settle Up" has no event tag at
        // all, so filtering by event_id here made settled debts look permanently unresolved.
        List<Settlement> settlements = settlementRepository.findByGroup_Id(event.getGroup().getId());
        List<DtoModels.PairwiseBalance> pairwise = calculateSimplifiedPairwise(shares, settlements);
        List<DtoModels.PairwiseBalance> rawPairwise = calculateRawPairwise(shares, settlements);
        return new DtoModels.EventSettlementResponse(eventId, pairwise, rawPairwise);
    }

    private List<DtoModels.PairwiseBalance> calculateSimplifiedPairwise(
            List<Share> shares, List<Settlement> settlements) {
        Map<Long, BigDecimal> net = SettlementCalculator.netBalances(toDebtRows(shares), toSettlementRows(settlements));
        List<SettlementCalculator.Edge> edges = SettlementCalculator.simplifyOptimal(net);
        return toPairwiseBalances(edges, "Optimized net balance");
    }

    private List<DtoModels.PairwiseBalance> toPairwiseBalances(
            List<SettlementCalculator.Edge> edges, String description) {
        List<DtoModels.PairwiseBalance> result = new ArrayList<>();
        for (SettlementCalculator.Edge e : edges) {
            String fromName = safeName(e.fromId());
            String toName = safeName(e.toId());
            result.add(new DtoModels.PairwiseBalance(
                    e.fromId(), fromName, e.toId(), toName, e.amount(), fromName,
                    description));
        }
        return result;
    }

    private DtoModels.SettlementOptimization toOptimizationDto(SettlementCalculator.OptimizationResult result) {
        return new DtoModels.SettlementOptimization(
                result.strategy(),
                result.rawTransactionCount(),
                result.optimizedTransactionCount(),
                result.eliminatedTransactionCount(),
                result.cycles().stream()
                        .map(c -> new DtoModels.DebtCycle(c.userIds(), c.cancellableAmount()))
                        .toList());
    }

    /**
     * The direct debts behind a simplified edge -- e.g. if A owes B, B owes C and C owes A,
     * this returns all three raw edges instead of the single net payment {@link #calculateSimplifiedPairwise}
     * would produce, so the UI can show what a circular/indirect debt is actually made of.
     */
    private List<DtoModels.PairwiseBalance> calculateRawPairwise(
            List<Share> shares, List<Settlement> settlements) {
        List<SettlementCalculator.Edge> edges = SettlementCalculator.rawPairwise(
                toDebtRows(shares), toSettlementRows(settlements));
        List<DtoModels.PairwiseBalance> result = new ArrayList<>();
        for (SettlementCalculator.Edge e : edges) {
            String fromName = safeName(e.fromId());
            String toName = safeName(e.toId());
            result.add(new DtoModels.PairwiseBalance(
                    e.fromId(), fromName, e.toId(), toName, e.amount(), fromName,
                    "Direct debt"));
        }
        return result;
    }

    private String safeName(Long id) {
        try {
            return userService.get(id).name();
        } catch (Exception ex) {
            return String.valueOf(id);
        }
    }

    private static List<SettlementCalculator.DebtRow> toDebtRows(List<Share> shares) {
        List<SettlementCalculator.DebtRow> rows = new ArrayList<>();
        for (Share s : shares) {
            rows.add(new SettlementCalculator.DebtRow(
                    s.getUser().getId(), s.getSubEvent().getPayer().getId(), s.getAmount()));
        }
        return rows;
    }

    private static List<SettlementCalculator.SettlementRow> toSettlementRows(List<Settlement> settlements) {
        List<SettlementCalculator.SettlementRow> rows = new ArrayList<>();
        for (Settlement st : settlements) {
            if (!isEffective(st)) continue;
            rows.add(new SettlementCalculator.SettlementRow(
                    st.getFromUser().getId(), st.getToUser().getId(), st.getAmount()));
        }
        return rows;
    }

    /**
     * Only CONFIRMED settlements affect balances. A pairwise settlement sits at
     * MARKED_AS_PAID (recorded by the debtor) until the creditor confirms it, mirroring
     * PaymentStatus on shares. Null status is legacy data (rows created before this field
     * existed, or by confirming an itemized share) and is treated as already-confirmed.
     */
    private static boolean isEffective(Settlement st) {
        return st.getStatus() == null || st.getStatus() == PaymentState.CONFIRMED;
    }

    /** Pairwise settlements sitting at MARKED_AS_PAID, awaiting the creditor's confirmation. */
    public List<DtoModels.SettlementLedgerEntry> pendingSettlements(@NonNull Long groupId) {
        if (!groupRepository.existsById(groupId))
            throw new NotFoundException("Group not found: " + groupId);
        return settlementRepository.findByGroup_IdAndStatus(groupId, PaymentState.MARKED_AS_PAID).stream()
                .map(this::toLedgerEntry)
                .sorted(Comparator.comparing(DtoModels.SettlementLedgerEntry::markedAt))
                .toList();
    }

    public List<DtoModels.SettlementLedgerEntry> pendingSettlements(@NonNull Long groupId, Long actorId) {
        requireGroupMember(groupId, actorId);
        return pendingSettlements(groupId);
    }

    /**
     * Full itemized breakdown for a group -- every debt-share and every settlement (any status),
     * with dates, so the UI can explain exactly what a simplified/circular settlement is made of.
     */
    public DtoModels.GroupLedgerResponse groupLedger(@NonNull Long groupId) {
        if (!groupRepository.existsById(groupId))
            throw new NotFoundException("Group not found: " + groupId);
        List<Share> shares = shareRepository.findBySubEvent_Event_Group_Id(groupId);
        List<Settlement> settlements = settlementRepository.findByGroup_Id(groupId);

        List<DtoModels.ShareLedgerEntry> shareEntries = shares.stream()
                .map(s -> new DtoModels.ShareLedgerEntry(
                        s.getSubEvent().getId(), s.getSubEvent().getDescription(), s.getSubEvent().getSubEventDate(),
                        s.getUser().getId(), s.getUser().getName(),
                        s.getSubEvent().getPayer().getId(), s.getSubEvent().getPayer().getName(),
                        s.getAmount(), s.getPaymentStatus() != null ? s.getPaymentStatus().getStatus() : null))
                .sorted(Comparator.comparing(DtoModels.ShareLedgerEntry::subEventDate).reversed())
                .toList();

        List<DtoModels.SettlementLedgerEntry> settlementEntries = settlements.stream()
                .map(this::toLedgerEntry)
                .sorted(Comparator.comparing(DtoModels.SettlementLedgerEntry::createdAt).reversed())
                .toList();

        return new DtoModels.GroupLedgerResponse(groupId, shareEntries, settlementEntries);
    }

    public DtoModels.GroupLedgerResponse groupLedger(@NonNull Long groupId, Long actorId) {
        requireGroupMember(groupId, actorId);
        return groupLedger(groupId);
    }

    private void requireGroupMember(Long groupId, Long actorId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        boolean isMember = actorId != null && (group.getCreator().getId().equals(actorId)
                || group.getMembers().stream().anyMatch(user -> user.getId().equals(actorId)));
        if (!isMember) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException("Only group members can view settlements");
        }
    }

    private DtoModels.SettlementLedgerEntry toLedgerEntry(Settlement s) {
        String status = s.getStatus() == null ? "CONFIRMED" : s.getStatus().name();
        return new DtoModels.SettlementLedgerEntry(
                s.getId(), s.getGroup().getId(),
                s.getFromUser().getId(), s.getFromUser().getName(),
                s.getToUser().getId(), s.getToUser().getName(),
                s.getAmount(), status, s.getMarkedAt(), s.getConfirmedAt(), s.getCreatedAt(),
                s.getTransactionRef(), s.getProofUrl(), s.getNote());
    }

    public DtoModels.SpendResponse mySpendForEvent(@NonNull Long eventId, @NonNull Long actorUserId) {
        java.math.BigDecimal sum = subEventRepository.sumTotalByEventAndPayer(eventId, actorUserId);
        return new DtoModels.SpendResponse(sum);
    }

    public DtoModels.SpendResponse mySpendForGroup(@NonNull Long groupId, @NonNull Long actorUserId) {
        java.math.BigDecimal sum = subEventRepository.sumTotalByGroupAndPayer(groupId, actorUserId);
        return new DtoModels.SpendResponse(sum);
    }
}
