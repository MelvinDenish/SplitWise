package com.groupfinancetracker.service;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.entity.*;
import com.groupfinancetracker.exception.ForbiddenActionException;
import com.groupfinancetracker.exception.NotFoundException;
import com.groupfinancetracker.repository.GroupRepository;
import com.groupfinancetracker.repository.ShareRepository;
import com.groupfinancetracker.repository.SubEventRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class AnalyticsService {
    private final GroupRepository groupRepository;
    private final SubEventRepository subEventRepository;
    private final ShareRepository shareRepository;

    public DtoModels.GroupAnalyticsResponse groupAnalytics(Long groupId, Long actorId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        if (!isMember(group, actorId)) throw new ForbiddenActionException("Only group members can view analytics");

        List<SubEvent> subEvents = subEventRepository.findByEvent_Group_Id(groupId);
        BigDecimal total = subEvents.stream().map(SubEvent::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<YearMonth, BigDecimal> monthTotals = subEvents.stream()
                .collect(Collectors.groupingBy(se -> YearMonth.from(se.getSubEventDate()),
                        Collectors.mapping(SubEvent::getTotalAmount,
                                Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))));
        BigDecimal monthlyAverage = average(monthTotals.values());
        BigDecimal forecast = forecast(monthTotals);
        List<DtoModels.CategorySpend> categories = categorySpends(subEvents);
        List<DtoModels.ExpenseInsight> insights = insights(subEvents, monthlyAverage, forecast);
        List<DtoModels.TrustScore> trustScores = trustScores(group, shareRepository.findBySubEvent_Event_Group_Id(groupId));

        return new DtoModels.GroupAnalyticsResponse(groupId, total.setScale(2, RoundingMode.HALF_UP),
                monthlyAverage, forecast, categories, insights, trustScores);
    }

    private BigDecimal forecast(Map<YearMonth, BigDecimal> monthTotals) {
        if (monthTotals.isEmpty()) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        List<YearMonth> months = monthTotals.keySet().stream().sorted().toList();
        if (months.size() == 1) return monthTotals.get(months.get(0)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal recent = monthTotals.get(months.get(months.size() - 1));
        BigDecimal priorAverage = average(months.subList(0, months.size() - 1).stream().map(monthTotals::get).toList());
        return recent.multiply(new BigDecimal("0.65")).add(priorAverage.multiply(new BigDecimal("0.35")))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal average(Collection<BigDecimal> values) {
        if (values.isEmpty()) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal sum = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(values.size()), 2, RoundingMode.HALF_UP);
    }

    private List<DtoModels.CategorySpend> categorySpends(List<SubEvent> subEvents) {
        Map<String, List<SubEvent>> byCategory = subEvents.stream()
                .collect(Collectors.groupingBy(se -> category(se.getDescription())));
        return byCategory.entrySet().stream()
                .map(e -> new DtoModels.CategorySpend(e.getKey(),
                        e.getValue().stream().map(SubEvent::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add)
                                .setScale(2, RoundingMode.HALF_UP),
                        e.getValue().size()))
                .sorted(Comparator.comparing(DtoModels.CategorySpend::amount).reversed())
                .toList();
    }

    private List<DtoModels.ExpenseInsight> insights(List<SubEvent> subEvents, BigDecimal monthlyAverage,
            BigDecimal forecast) {
        List<DtoModels.ExpenseInsight> insights = new ArrayList<>();
        subEvents.stream()
                .filter(se -> monthlyAverage.signum() > 0
                        && se.getTotalAmount().compareTo(monthlyAverage.multiply(new BigDecimal("1.75"))) > 0)
                .max(Comparator.comparing(SubEvent::getTotalAmount))
                .ifPresent(se -> insights.add(new DtoModels.ExpenseInsight("SPIKE", "Unusual expense spike",
                        se.getDescription() + " is much higher than your average monthly spend.", se.getTotalAmount())));

        Map<String, Long> recurringCandidates = subEvents.stream()
                .collect(Collectors.groupingBy(se -> normalized(se.getDescription()), Collectors.counting()));
        recurringCandidates.entrySet().stream()
                .filter(e -> e.getValue() >= 2)
                .findFirst()
                .ifPresent(e -> insights.add(new DtoModels.ExpenseInsight("RECURRING_SUGGESTION",
                        "Possible recurring expense",
                        "You have logged similar expenses named \"" + e.getKey() + "\" multiple times.",
                        BigDecimal.valueOf(e.getValue()))));

        if (forecast.compareTo(monthlyAverage) > 0 && monthlyAverage.signum() > 0) {
            insights.add(new DtoModels.ExpenseInsight("FORECAST", "Next month may run higher",
                    "Your recent spending trend is above the long-term monthly average.", forecast));
        }
        return insights;
    }

    private List<DtoModels.TrustScore> trustScores(Group group, List<Share> shares) {
        return group.getMembers().stream()
                .map(member -> trustScore(member, shares))
                .sorted(Comparator.comparing(DtoModels.TrustScore::onTimeRate).reversed()
                        .thenComparing(DtoModels.TrustScore::userName))
                .toList();
    }

    private DtoModels.TrustScore trustScore(User user, List<Share> shares) {
        int confirmed = 0;
        int pending = 0;
        int pendingConfirmations = 0;
        int onTime = 0;
        long delayDaysTotal = 0;
        int delayCount = 0;
        for (Share share : shares) {
            if (!Objects.equals(share.getUser().getId(), user.getId())) continue;
            if (Objects.equals(share.getSubEvent().getPayer().getId(), user.getId())) continue;
            PaymentStatus status = share.getPaymentStatus();
            if (status != null && status.getStatus() == PaymentState.CONFIRMED) {
                confirmed++;
                if (status.getConfirmedAt() != null && share.getSubEvent().getTimestamp() != null) {
                    long days = Math.max(0, Duration.between(share.getSubEvent().getTimestamp(), status.getConfirmedAt()).toDays());
                    delayDaysTotal += days;
                    delayCount++;
                    if (days <= 7) onTime++;
                }
            } else {
                pending++;
                if (status != null && status.getStatus() == PaymentState.MARKED_AS_PAID) pendingConfirmations++;
            }
        }
        double onTimeRate = confirmed == 0 ? 0.0 : (double) onTime / confirmed;
        double avgDelay = delayCount == 0 ? 0.0 : (double) delayDaysTotal / delayCount;
        String badge = confirmed >= 3 && onTimeRate >= 0.8 && pending <= 1
                ? "Reliable payer"
                : pending >= 3 ? "Needs follow-up" : "Building history";
        return new DtoModels.TrustScore(user.getId(), user.getName(), confirmed, pending, pendingConfirmations,
                round(onTimeRate), round(avgDelay), badge);
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private String category(String description) {
        String text = normalized(description);
        if (text.matches(".*(food|lunch|dinner|restaurant|meal|snack|cafe|coffee).*")) return "Food";
        if (text.matches(".*(cab|uber|ola|transport|train|bus|fuel|petrol).*")) return "Transport";
        if (text.matches(".*(hotel|stay|room|booking|trip).*")) return "Travel";
        if (text.matches(".*(grocery|supermarket|mart).*")) return "Groceries";
        if (text.matches(".*(electricity|internet|rent|bill|utility).*")) return "Bills";
        return "Other";
    }

    private String normalized(String value) {
        return Optional.ofNullable(value).orElse("expense").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9 ]", "").trim();
    }

    private boolean isMember(Group group, Long userId) {
        return userId != null && (Objects.equals(group.getCreator().getId(), userId)
                || group.getMembers().stream().anyMatch(user -> Objects.equals(user.getId(), userId)));
    }
}
