package com.groupfinancetracker.controller;

import com.groupfinancetracker.dto.DtoModels.*;
import com.groupfinancetracker.service.GroupService;
import com.groupfinancetracker.service.EventService;
import com.groupfinancetracker.service.GroupJoinService;
import com.groupfinancetracker.service.SettlementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {
    private final GroupService groupService;
    private final GroupJoinService groupJoinService;
    private final EventService eventService;
    private final SettlementService settlementService;

    @PostMapping
    public GroupResponse create(@Valid @RequestBody CreateGroupRequest req) {
        return groupService.create(req);
    }

    @GetMapping("/{id}")
    public GroupResponse get(@PathVariable Long id) {
        return groupService.get(id, actorId());
    }

    @GetMapping
    public List<GroupResponse> listForUser(@RequestParam("userId") Long userId) {
        Long actorId = actorId();
        if (actorId == null || !actorId.equals(userId)) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException("You can only list your own groups");
        }
        return groupService.listForUser(userId);
    }

    @PostMapping("/{groupId}/members")
    public void addMember(@PathVariable Long groupId, @Valid @RequestBody AddMemberRequest req) {
        groupService.addMember(groupId, req.userId());
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    public void removeMember(@PathVariable Long groupId, @PathVariable Long userId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        groupService.removeMember(groupId, userId, actorId);
    }

    @PostMapping("/{groupId}/generate-code")
    public GenerateGroupCodeResponse generateCode(@PathVariable Long groupId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupJoinService.generateCode(groupId, actorId);
    }

    @GetMapping("/{groupId}/code")
    public GroupCodeResponse getCode(@PathVariable Long groupId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupJoinService.getCode(groupId, actorId);
    }

    @PostMapping("/join-request")
    public JoinRequestResponse submitJoin(@Valid @RequestBody SubmitJoinRequest req) {
        return groupJoinService.submitJoin(req);
    }

    @GetMapping("/{groupId}/join-requests")
    public List<JoinRequestResponse> listPending(@PathVariable Long groupId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupJoinService.listPendingForGroup(groupId, actorId);
    }

    @PostMapping("/{groupId}/join-requests/{requestId}/approve")
    public JoinRequestResponse approve(@PathVariable Long groupId, @PathVariable Long requestId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        if (actorId == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "User not authenticated");
        }
        return groupJoinService.approve(groupId, requestId, actorId);
    }

    @PostMapping("/{groupId}/join-requests/{requestId}/reject")
    public JoinRequestResponse reject(@PathVariable Long groupId, @PathVariable Long requestId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        if (actorId == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "User not authenticated");
        }
        return groupJoinService.reject(groupId, requestId, actorId);
    }

    @GetMapping("/requests/pending")
    public List<JoinRequestResponse> listPendingJoinRequests() {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupJoinService.listPendingForCreator(actorId);
    }

    @GetMapping("/{groupId}/settlements/by-week")
    public com.groupfinancetracker.dto.DtoModels.WeeklySettlementResponse groupSettlementsByWeek(
            @PathVariable Long groupId,
            @RequestParam("week") Integer weekNumber,
            @RequestParam("year") Integer year) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return settlementService.weeklySettlements(groupId, weekNumber, year, actorId);
    }

    @GetMapping("/{groupId}/balances/by-week")
    public com.groupfinancetracker.dto.DtoModels.WeeklySettlementResponse balancesByWeek(@PathVariable Long groupId,
            @RequestParam("week") Integer weekNumber,
            @RequestParam("year") Integer year) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return settlementService.weeklySettlements(groupId, weekNumber, year, actorId);
    }

    @PostMapping("/{groupId}/invite")
    public InvitationResponse invite(@PathVariable Long groupId, @Valid @RequestBody CreateInvitationRequest req) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupService.createInvitation(groupId, req.invitedUserId(), actorId);
    }

    @GetMapping("/invitations/my")
    public List<InvitationResponse> listMyInvitations() {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupService.listMyInvitations(actorId);
    }

    @PostMapping("/invitations/{invitationId}/respond")
    public InvitationResponse respondToInvitation(@PathVariable Long invitationId,
            @Valid @RequestBody RespondInvitationRequest req) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupService.respondToInvitation(invitationId, actorId, req.status());
    }

    @GetMapping("/{groupId}/weeks/new-event-warning")
    public com.groupfinancetracker.dto.DtoModels.NewEventWarningResponse newEventWarning(@PathVariable Long groupId,
            @RequestParam(value = "date", required = false) java.time.LocalDate date) {
        return eventService.newEventWarning(groupId, date);
    }

    @PutMapping("/{groupId}")
    public GroupResponse update(@PathVariable Long groupId, @Valid @RequestBody UpdateGroupRequest req) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupService.updateGroup(groupId, req, actorId);
    }

    @GetMapping("/{groupId}/spend")
    public com.groupfinancetracker.dto.DtoModels.GroupSpendResponse spend(@PathVariable Long groupId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return groupService.groupSpend(groupId, actorId);
    }

    @DeleteMapping("/{groupId}")
    public void delete(@PathVariable Long groupId) {
        groupService.delete(groupId, actorId());
    }

    private Long actorId() {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        return details instanceof Long ? (Long) details : null;
    }
}
