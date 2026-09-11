package com.groupfinancetracker.service;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.entity.Group;
import com.groupfinancetracker.entity.User;
import com.groupfinancetracker.exception.NotFoundException;
import com.groupfinancetracker.repository.GroupRepository;
import com.groupfinancetracker.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import com.groupfinancetracker.entity.GroupInvitation;
import com.groupfinancetracker.entity.JoinRequestStatus;
import com.groupfinancetracker.repository.GroupInvitationRepository;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class GroupService {
    private final GroupRepository groupRepository;
    private final UserRepository userRepository;
    private final GroupInvitationRepository groupInvitationRepository;
    private final SettlementService settlementService;
    private final com.groupfinancetracker.repository.SubEventRepository subEventRepository;

    public DtoModels.GroupResponse create(DtoModels.CreateGroupRequest req) {
        User creator = userRepository.findById(req.creatorId())
                .orElseThrow(() -> new NotFoundException("Creator not found: " + req.creatorId()));
        Group g = Group.builder().name(req.name()).creator(creator).budgetLimit(req.budgetLimit()).build();
        Set<User> members = new HashSet<>();
        members.add(creator);
        if (req.memberIds() != null) {
            for (Long mId : req.memberIds()) {
                userRepository.findById(mId).ifPresent(members::add);
            }
        }
        g.setMembers(members);
        g.setGroupCode(generateUniqueCode());
        g = groupRepository.save(g);
        return toDto(g);
    }

    public DtoModels.GroupResponse get(Long id) {
        Group g = groupRepository.findById(id).orElseThrow(() -> new NotFoundException("Group not found: " + id));
        return toDto(g);
    }

    public DtoModels.GroupResponse get(Long id, Long actorId) {
        Group g = groupRepository.findById(id).orElseThrow(() -> new NotFoundException("Group not found: " + id));
        if (!isMember(g, actorId)) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException("Only group members can view this group");
        }
        return toDto(g);
    }

    public List<DtoModels.GroupResponse> listForUser(Long userId) {
        return groupRepository.findAllByMembers_Id(userId)
                .stream()
                .map(g -> this.toDto(g))
                .collect(java.util.stream.Collectors.toList());
    }

    public void addMember(Long groupId, Long userId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        User u = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User not found: " + userId));
        g.getMembers().add(u);
        groupRepository.save(g);
    }

    private boolean isMember(Group group, Long userId) {
        return userId != null && (group.getCreator().getId().equals(userId)
                || group.getMembers().stream().anyMatch(u -> u.getId().equals(userId)));
    }

    public void removeMember(Long groupId, Long userId, Long actorUserId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));

        // Only creator can remove members, or a member can remove themselves (exit/leave group)
        if (!g.getCreator().getId().equals(actorUserId) && !userId.equals(actorUserId)) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException(
                    "Only the group creator can remove members, or a member can leave themselves");
        }

        // Cannot remove creator
        if (g.getCreator().getId().equals(userId)) {
            throw new IllegalArgumentException("Cannot remove the group creator");
        }

        // Check for pending settlements (non-zero balance)
        var summary = settlementService.groupSummary(groupId);
        boolean hasBalance = summary.balances().stream()
                .anyMatch(
                        ub -> ub.userId().equals(userId) && ub.netBalance().compareTo(java.math.BigDecimal.ZERO) != 0);

        if (hasBalance) {
            throw new IllegalStateException("Cannot remove member with pending settlements (non-zero balance)");
        }

        g.getMembers().removeIf(m -> m.getId().equals(userId));
        groupRepository.save(g);
    }

    public DtoModels.GroupResponse updateGroup(Long groupId, DtoModels.UpdateGroupRequest req, Long actorId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        if (!g.getCreator().getId().equals(actorId)) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException(
                    "Only the group creator can update the group");
        }
        g.setName(req.name());
        g.setBudgetLimit(req.budgetLimit());
        groupRepository.save(g);
        return toDto(g);
    }

    public DtoModels.GroupSpendResponse groupSpend(Long groupId, Long actorId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        boolean isMember = actorId != null && (g.getCreator().getId().equals(actorId)
                || g.getMembers().stream().anyMatch(u -> u.getId().equals(actorId)));
        if (!isMember) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException(
                    "Only group members can view group spend");
        }
        java.math.BigDecimal spent = subEventRepository.sumTotalByGroup(groupId);
        return new DtoModels.GroupSpendResponse(groupId, g.getBudgetLimit(),
                spent != null ? spent : java.math.BigDecimal.ZERO);
    }

    private DtoModels.GroupResponse toDto(Group g) {
        Set<Long> memberIds = g.getMembers().stream().map(User::getId).collect(java.util.stream.Collectors.toSet());
        // Embedding full member profiles here saves every caller (event/expense pages, the
        // create-expense modal) a separate GET /users call just to resolve names for memberIds.
        List<DtoModels.UserResponse> members = g.getMembers().stream()
                .map(u -> new DtoModels.UserResponse(u.getId(), u.getName(), u.getEmail(), u.getUpiId(), u.getCreatedAt()))
                .sorted(java.util.Comparator.comparing(DtoModels.UserResponse::name))
                .toList();
        return new DtoModels.GroupResponse(g.getId(), g.getName(), g.getCreator().getId(), memberIds, g.getCreatedAt(),
                g.getGroupCode(), g.getBudgetLimit(), members);
    }

    private String generateUniqueCode() {
        SecureRandom rnd = new SecureRandom();
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (int attempt = 0; attempt < 10; attempt++) {
            int len = 8 + rnd.nextInt(3);
            StringBuilder sb = new StringBuilder(len);
            for (int i = 0; i < len; i++)
                sb.append(alphabet.charAt(rnd.nextInt(alphabet.length())));
            String code = sb.toString();
            if (!groupRepository.existsByGroupCode(code))
                return code;
        }
        // Fallback: generate fixed-length code with prefix and ensure uniqueness
        while (true) {
            StringBuilder sb = new StringBuilder(10);
            sb.append('G').append('R').append('P');
            for (int i = 0; i < 7; i++)
                sb.append(alphabet.charAt(rnd.nextInt(alphabet.length())));
            String code = sb.toString();
            if (!groupRepository.existsByGroupCode(code))
                return code;
        }
    }

    public DtoModels.InvitationResponse createInvitation(Long groupId, Long invitedUserId, Long invitedById) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        User invitedUser = userRepository.findById(invitedUserId)
                .orElseThrow(() -> new NotFoundException("User not found: " + invitedUserId));
        User invitedBy = userRepository.findById(invitedById)
                .orElseThrow(() -> new NotFoundException("User not found: " + invitedById));

        // Check if already member
        if (g.getMembers().contains(invitedUser)) {
            throw new IllegalArgumentException("User is already a member of the group");
        }

        // Check if pending invitation exists
        if (groupInvitationRepository
                .findByGroupIdAndInvitedUserIdAndStatus(groupId, invitedUserId, JoinRequestStatus.PENDING)
                .isPresent()) {
            throw new IllegalArgumentException("Invitation already exists for this user");
        }

        GroupInvitation invitation = GroupInvitation.builder()
                .group(g)
                .invitedUser(invitedUser)
                .invitedBy(invitedBy)
                .status(JoinRequestStatus.PENDING)
                .build();
        invitation = groupInvitationRepository.save(invitation);
        return toInvitationDto(invitation);
    }

    public List<DtoModels.InvitationResponse> listMyInvitations(Long userId) {
        return groupInvitationRepository.findByInvitedUserIdAndStatus(userId, JoinRequestStatus.PENDING)
                .stream().map(this::toInvitationDto).collect(java.util.stream.Collectors.toList());
    }

    public DtoModels.InvitationResponse respondToInvitation(Long invitationId, Long userId, String statusStr) {
        GroupInvitation invitation = groupInvitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found: " + invitationId));

        if (!invitation.getInvitedUser().getId().equals(userId)) {
            throw new SecurityException("Not authorized to respond to this invitation");
        }

        if (invitation.getStatus() != JoinRequestStatus.PENDING) {
            throw new IllegalArgumentException("Invitation is already " + invitation.getStatus());
        }

        JoinRequestStatus status = JoinRequestStatus.valueOf(statusStr.toUpperCase());
        if (status != JoinRequestStatus.ACCEPTED && status != JoinRequestStatus.REJECTED) {
            throw new IllegalArgumentException("Invalid status: " + statusStr);
        }

        invitation.setStatus(status);
        invitation.setRespondedAt(LocalDateTime.now());
        groupInvitationRepository.save(invitation);

        if (status == JoinRequestStatus.ACCEPTED) {
            Group g = invitation.getGroup();
            g.getMembers().add(invitation.getInvitedUser());
            groupRepository.save(g);
        }

        return toInvitationDto(invitation);
    }

    public void delete(Long groupId, Long actorUserId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found: " + groupId));
        if (!g.getCreator().getId().equals(actorUserId)) {
            throw new com.groupfinancetracker.exception.ForbiddenActionException(
                    "Only the group creator can delete the group");
        }
        // Check if group has any events
        if (!g.getEvents().isEmpty()) {
            throw new IllegalStateException(
                    "Cannot delete group with existing events. Please delete all events first.");
        }

        // Delete invitations
        groupInvitationRepository.deleteAll(groupInvitationRepository.findByGroupId(groupId));

        groupRepository.delete(g);
    }

    private DtoModels.InvitationResponse toInvitationDto(GroupInvitation i) {
        return new DtoModels.InvitationResponse(
                i.getId(),
                i.getGroup().getId(),
                i.getGroup().getName(),
                i.getInvitedUser().getId(),
                i.getInvitedUser().getName(),
                i.getInvitedBy().getId(),
                i.getInvitedBy().getName(),
                i.getStatus().name(),
                i.getCreatedAt());
    }
}
