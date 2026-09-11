package com.groupfinancetracker.dto;

import com.groupfinancetracker.entity.PaymentState;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

public final class DtoModels {
        private DtoModels() {
        }

        public record CreateUserRequest(@NotBlank String name, @NotBlank @Email String email,
                        @NotBlank @Size(min = 8) String password) {
        }

        public record UserResponse(Long id, String name, String email, String upiId, Instant createdAt) {
        }

        public record UpdateProfileRequest(@NotBlank String name, String upiId) {
        }

        public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
        }

        public record AuthResponse(@NotBlank String token, UserResponse user) {
        }

        /** Google OAuth: credential is the Google ID token from the frontend */
        public record GoogleAuthRequest(@NotBlank String credential) {
        }

        /** Forgot-password: verified via master password sent by email at signup */
        public record ForgotPasswordRequest(
                @NotBlank @Email String email,
                @NotBlank String masterPassword,
                @NotBlank @Size(min = 8) String newPassword) {
        }

        public record CreateGroupRequest(@NotBlank String name, @NotNull Long creatorId, Set<Long> memberIds, BigDecimal budgetLimit) {
        }

        public record UpdateGroupRequest(@NotBlank String name, BigDecimal budgetLimit) {
        }

        public record GroupSpendResponse(Long groupId, BigDecimal budgetLimit, BigDecimal spent) {
        }

        public record GroupResponse(Long id, String name, Long creatorId, Set<Long> memberIds, Instant createdAt,
                        String groupCode, BigDecimal budgetLimit, List<UserResponse> members) {
        }

        public record AddMemberRequest(@NotNull Long userId) {
        }

        public record GenerateGroupCodeResponse(Long groupId, String groupCode) {
        }

        public record GroupCodeResponse(Long groupId, String groupCode) {
        }

        public record CreateEventRequest(@NotNull Long groupId, @NotBlank String name, @NotNull Long creatorId,
                        LocalDate eventDate) {
        }

        public record EventResponse(Long id, String name, Long groupId, Long creatorId, Instant createdAt,
                        LocalDate eventDate, Integer weekNumber, Integer year, BigDecimal totalAmount) {
        }

        public record CreateSubEventRequest(
                        @NotNull Long eventId,
                        @NotBlank String description,
                        @NotNull @Positive BigDecimal totalAmount,
                        @NotNull Long payerId,
                        @NotNull LocalDate subEventDate,
                        @NotEmpty List<ShareSplit> shares,
                        boolean isRecurring,
                        String recurringPeriod) {
        }

        public record ShareSplit(@NotNull Long userId, @NotNull @Positive BigDecimal amount) {
        }

        public record UpdateSubEventRequest(
                        @NotBlank String description,
                        @NotNull @Positive BigDecimal totalAmount,
                        @NotNull Long payerId,
                        @NotNull LocalDate subEventDate,
                        @NotEmpty List<ShareSplit> shares,
                        boolean isRecurring,
                        String recurringPeriod) {
        }

        public record SubEventResponse(Long id, String description, BigDecimal totalAmount, Long payerId, Long eventId,
                        Long eventCreatorId, Instant timestamp, LocalDate subEventDate, Integer weekNumber,
                        Integer year, boolean isRecurring, String recurringPeriod, Instant nextRunDate) {
        }

        public record WeeklyReportItem(
                        Long subEventId,
                        String subEventDescription,
                        BigDecimal totalAmount,
                        LocalDate subEventDate,
                        Integer weekNumber,
                        Integer year,
                        Long eventId,
                        String eventName,
                        Long groupId,
                        String groupName,
                        Long payerId,
                        String payerName,
                        String role, // "PAYER", "SHARER", "PAYER_AND_SHARER"
                        BigDecimal myShareAmount,
                        String status // "PENDING", "PAID", "CONFIRMED", "N/A"
        ) {
        }

        public record ShareResponse(Long id, Long subEventId, Long userId, String userName, String userUpiId, Long payerId, BigDecimal amount,
                        PaymentState status, Instant markedAt, Instant confirmedAt, String transactionRef, String proofUrl) {
        }

        public record MarkPaymentRequest(@NotNull Long shareId, @NotNull Long actorUserId, String transactionRef, String proofUrl) {
        }

        public record ConfirmPaymentRequest(@NotNull Long shareId, @NotNull Long actorUserId) {
        }

        public record UserBalance(Long userId, BigDecimal netBalance) {
        }

        public record GroupSettlementSummary(Long groupId, List<UserBalance> balances, int outstandingConfirmations) {
        }

        public record UserOutstandingDebts(Long userId, List<ShareResponse> debts) {
        }

        public record PairwiseOwe(Long fromUserId, Long toUserId, BigDecimal amount, String description) {
        }

        public record GroupPairwise(Long groupId, List<PairwiseOwe> owes, List<PairwiseBalance> pairwiseBalances,
                        List<PairwiseBalance> rawPairwiseBalances, SettlementOptimization optimization) {
        }

        public record DebtCycle(List<Long> userIds, BigDecimal cancellableAmount) {
        }

        public record SettlementOptimization(String strategy, int rawTransactionCount, int optimizedTransactionCount,
                        int eliminatedTransactionCount, List<DebtCycle> cycles) {
        }

        /** A pairwise/circular settlement, at any point in its mark-as-paid -> confirm lifecycle. */
        public record SettlementLedgerEntry(Long id, Long groupId, Long fromUserId, String fromUserName,
                        Long toUserId, String toUserName, BigDecimal amount, String status, Instant markedAt,
                        Instant confirmedAt, Instant createdAt, String transactionRef, String proofUrl, String note) {
        }

        public record NotificationResponse(Long id, Long recipientId, Long senderId, String senderName, Long groupId,
                        String groupName, Long shareId, Long settlementId, String type, String title, String message,
                        BigDecimal amount, Instant createdAt, Instant readAt) {
        }

        public record ShareReminderRequest(@NotNull Long shareId, String message) {
        }

        public record PairwiseReminderRequest(@NotNull Long groupId, @NotNull Long debtorId,
                        @NotNull Long creditorId, @NotNull @Positive BigDecimal amount, String message) {
        }

        /** One itemized expense-share debt, for the settlement explainability breakdown. */
        public record ShareLedgerEntry(Long subEventId, String description, LocalDate subEventDate,
                        Long debtorId, String debtorName, Long creditorId, String creditorName, BigDecimal amount,
                        PaymentState status) {
        }

        public record GroupLedgerResponse(Long groupId, List<ShareLedgerEntry> shares,
                        List<SettlementLedgerEntry> settlements) {
        }

        public record SubmitJoinRequest(@NotBlank String groupCode, @NotNull Long userId) {
        }

        public record JoinRequestResponse(Long id, Long groupId, String groupCode, Long requesterId, String status,
                        LocalDateTime requestedAt, LocalDateTime respondedAt, Long respondedBy) {
        }

        public record WeekSummary(Integer weekNumber, Integer year, Long eventCount) {
        }

        public record ToPayEntry(Long userId, String toUser, BigDecimal amount) {
        }

        public record ToReceiveEntry(Long userId, String fromUser, BigDecimal amount) {
        }

        public record PairwiseBalance(Long user1Id, String user1, Long user2Id, String user2, BigDecimal amount,
                        String owedBy, String description) {
        }

        public record WeeklySettlementResponse(Integer weekNumber, Integer year, Long currentUser,
                        List<ToPayEntry> toPay,
                        List<ToReceiveEntry> toReceive, List<PairwiseBalance> pairwiseBalances,
                        List<PairwiseBalance> rawPairwiseBalances) {
        }

        public record EventSettlementResponse(Long eventId, List<PairwiseBalance> pairwiseBalances,
                        List<PairwiseBalance> rawPairwiseBalances) {
        }

        public record NewEventWarningResponse(boolean warn, boolean blocked, Integer droppingWeek, Integer droppingYear,
                        int pendingPayments,
                        String message) {
        }

        public record SpendResponse(BigDecimal amount) {
        }

        public record CreateInvitationRequest(@NotNull Long groupId, @NotNull Long invitedUserId) {
        }

        public record InvitationResponse(Long id, Long groupId, String groupName, Long invitedUserId,
                        String invitedUserName, Long invitedById, String invitedByName, String status,
                        LocalDateTime createdAt) {
        }

        public record RespondInvitationRequest(@NotNull String status) {
        } // status: ACCEPTED, REJECTED
}
