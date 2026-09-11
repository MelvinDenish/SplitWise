package com.groupfinancetracker.controller;

import com.groupfinancetracker.dto.DtoModels.ConfirmPaymentRequest;
import com.groupfinancetracker.dto.DtoModels.DisputePaymentRequest;
import com.groupfinancetracker.dto.DtoModels.MarkPaymentRequest;
import com.groupfinancetracker.dto.DtoModels.ShareResponse;
import com.groupfinancetracker.service.PaymentDisputeService;
import com.groupfinancetracker.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {
    private final PaymentService paymentService;
    private final PaymentDisputeService paymentDisputeService;

    /** Accepts a JSON number OR a numeric string for a Map<String,Object> body field -- callers
     * (e.g. a value sourced from a URL route param) don't always send a real JSON number. */
    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        if (v instanceof String s && !s.isBlank()) return Long.valueOf(s.trim());
        throw new IllegalArgumentException("Expected a number, got: " + v);
    }

    private static java.math.BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof String s && s.isBlank()) return null;
        return new java.math.BigDecimal(v.toString());
    }

    @PostMapping("/mark-paid")
    public ShareResponse markPaid(@RequestBody Map<String, Object> body) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null ? SecurityContextHolder.getContext().getAuthentication().getDetails() : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        Long shareId = toLong(body.get("shareId"));
        String transactionRef = (String) body.get("transactionRef");
        String proofUrl = (String) body.get("proofUrl");
        return paymentService.markPaid(new MarkPaymentRequest(shareId, actorId, transactionRef, proofUrl));
    }

    @PostMapping("/confirm")
    public ShareResponse confirm(@RequestBody Map<String, Long> body) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null ? SecurityContextHolder.getContext().getAuthentication().getDetails() : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        Long shareId = body.get("shareId");
        return paymentService.confirm(new ConfirmPaymentRequest(shareId, actorId));
    }

    @PostMapping("/settle-pairwise")
    public com.groupfinancetracker.dto.DtoModels.SettlementLedgerEntry settlePairwise(@RequestBody Map<String, Object> body) {
        Long groupId = toLong(body.get("groupId"));
        Long eventId = toLong(body.get("eventId"));
        Long debtorId = toLong(body.get("debtorId"));
        Long creditorId = toLong(body.get("creditorId"));
        java.math.BigDecimal amount = toBigDecimal(body.get("amount"));
        String transactionRef = (String) body.get("transactionRef");
        String proofUrl = (String) body.get("proofUrl");

        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return paymentService.settlePairwise(groupId, eventId, debtorId, creditorId, amount, transactionRef, proofUrl, actorId);
    }

    @PostMapping("/confirm-pairwise")
    public com.groupfinancetracker.dto.DtoModels.SettlementLedgerEntry confirmPairwise(@RequestBody Map<String, Object> body) {
        Long settlementId = toLong(body.get("settlementId"));
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return paymentService.confirmPairwiseSettlement(settlementId, actorId);
    }

    @PostMapping("/dispute")
    public com.groupfinancetracker.dto.DtoModels.PaymentDisputeResponse dispute(
            @Valid @RequestBody DisputePaymentRequest request) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return paymentDisputeService.dispute(request, actorId);
    }

    @GetMapping("/groups/{groupId}/disputes")
    public java.util.List<com.groupfinancetracker.dto.DtoModels.PaymentDisputeResponse> disputes(
            @PathVariable Long groupId) {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        Long actorId = details instanceof Long ? (Long) details : null;
        return paymentDisputeService.listByGroup(groupId, actorId);
    }
}
