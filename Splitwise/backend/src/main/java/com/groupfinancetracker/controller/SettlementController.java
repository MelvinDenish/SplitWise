package com.groupfinancetracker.controller;

import com.groupfinancetracker.dto.DtoModels.*;
import com.groupfinancetracker.service.SettlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settlements")
@RequiredArgsConstructor
public class SettlementController {
    private final SettlementService settlementService;

    @GetMapping("/group/{groupId}")
    public GroupSettlementSummary group(@PathVariable Long groupId) { return settlementService.groupSummary(groupId, actorId()); }

    @GetMapping("/user/{userId}")
    public UserOutstandingDebts user(@PathVariable Long userId) { return settlementService.userDebts(userId); }

    @GetMapping("/group/{groupId}/pairwise")
    public GroupPairwise pairwise(@PathVariable Long groupId) { return settlementService.groupPairwise(groupId, actorId()); }

    @GetMapping("/group/{groupId}/pending")
    public java.util.List<com.groupfinancetracker.dto.DtoModels.SettlementLedgerEntry> pending(@PathVariable Long groupId) {
        return settlementService.pendingSettlements(groupId, actorId());
    }

    @GetMapping("/group/{groupId}/ledger")
    public com.groupfinancetracker.dto.DtoModels.GroupLedgerResponse ledger(@PathVariable Long groupId) {
        return settlementService.groupLedger(groupId, actorId());
    }

    @GetMapping("/group/{groupId}/by-week")
    public WeeklySettlementResponse settlementsByWeek(@PathVariable Long groupId, @RequestParam("week") Integer weekNumber, @RequestParam("year") Integer year) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null ? SecurityContextHolder.getContext().getAuthentication().getDetails() : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return settlementService.weeklySettlements(groupId, weekNumber, year, actorId);
    }

    @GetMapping("/group/{groupId}/balances/by-week")
    public WeeklySettlementResponse balancesByWeek(@PathVariable Long groupId, @RequestParam("week") Integer weekNumber, @RequestParam("year") Integer year) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null ? SecurityContextHolder.getContext().getAuthentication().getDetails() : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return settlementService.weeklySettlements(groupId, weekNumber, year, actorId);
    }

    @GetMapping("/event/{eventId}/pairwise")
    public com.groupfinancetracker.dto.DtoModels.EventSettlementResponse eventPairwise(@PathVariable Long eventId) {
        return settlementService.eventPairwise(eventId);
    }

    @GetMapping("/event/{eventId}/my-spend")
    public com.groupfinancetracker.dto.DtoModels.SpendResponse mySpendEvent(@PathVariable Long eventId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null ? SecurityContextHolder.getContext().getAuthentication().getDetails() : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        if (actorId == null) throw new RuntimeException("Unauthorized");
        return settlementService.mySpendForEvent(eventId, actorId);
    }

    @GetMapping("/group/{groupId}/my-spend")
    public com.groupfinancetracker.dto.DtoModels.SpendResponse mySpendGroup(@PathVariable Long groupId) {
        Long actorId = actorId();
        if (actorId == null) throw new RuntimeException("Unauthorized");
        return settlementService.mySpendForGroup(groupId, actorId);
    }

    private Long actorId() {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null ? SecurityContextHolder.getContext().getAuthentication().getDetails() : null;
        return details instanceof Long ? (Long) details : null;
    }
}
