package com.groupfinancetracker.service;

import com.groupfinancetracker.dto.DtoModels;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ReceiptScannerService {
    private static final Pattern MONEY_AT_END = Pattern.compile("(.+?)\\s+([0-9]+(?:[.,][0-9]{1,2})?)\\s*$");
    private static final Pattern REF_PATTERN = Pattern.compile("(?i)(?:upi|utr|ref(?:erence)?|txn|transaction)\\D{0,12}([A-Z0-9]{8,24})");
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("(?i)(?:rs\\.?|inr|₹)\\s*([0-9]+(?:[.,][0-9]{1,2})?)");
    private static final Pattern DATE_PATTERN = Pattern.compile("(\\d{4}-\\d{2}-\\d{2}|\\d{2}[/-]\\d{2}[/-]\\d{4})");

    public DtoModels.ReceiptScanResponse scan(DtoModels.ReceiptScanRequest request) {
        String text = Optional.ofNullable(request.receiptText()).orElse("");
        List<DtoModels.ReceiptLineItem> items = new ArrayList<>();
        BigDecimal tax = BigDecimal.ZERO;
        BigDecimal tip = BigDecimal.ZERO;
        BigDecimal detectedTotal = BigDecimal.ZERO;

        for (String rawLine : text.split("\\R")) {
            String line = rawLine.trim();
            if (line.length() < 3) continue;
            Matcher matcher = MONEY_AT_END.matcher(line.replace("₹", " "));
            if (!matcher.find()) continue;

            String label = matcher.group(1).replaceAll("\\s+", " ").trim();
            BigDecimal amount = money(matcher.group(2));
            String lower = label.toLowerCase(Locale.ROOT);
            boolean taxLike = lower.contains("tax") || lower.contains("gst") || lower.contains("cgst")
                    || lower.contains("sgst") || lower.contains("vat");
            boolean tipLike = lower.contains("tip") || lower.contains("service charge");
            boolean totalLike = lower.equals("total") || lower.contains("grand total") || lower.contains("amount due");

            if (taxLike) tax = tax.add(amount);
            if (tipLike) tip = tip.add(amount);
            if (totalLike) detectedTotal = amount;
            if (!totalLike) {
                items.add(new DtoModels.ReceiptLineItem(label, amount, taxLike || tipLike, amount.signum() <= 0));
            }
        }

        BigDecimal subtotal = items.stream()
                .filter(item -> !item.taxLike())
                .map(DtoModels.ReceiptLineItem::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal computedTotal = subtotal.add(tax).add(tip).setScale(2, RoundingMode.HALF_UP);
        if (detectedTotal.signum() == 0) detectedTotal = computedTotal;

        boolean duplicateSuspected = items.size() != items.stream()
                .map(item -> item.label().toLowerCase(Locale.ROOT) + "|" + item.amount())
                .distinct()
                .count();
        BigDecimal expected = request.expectedTotal();
        boolean suspiciousTotal = expected != null
                && detectedTotal.subtract(expected).abs().compareTo(new BigDecimal("1.00")) > 0;
        String warning = suspiciousTotal
                ? "Detected total does not match the amount entered for this expense."
                : duplicateSuspected
                        ? "Possible duplicate receipt lines were detected."
                        : "";

        return new DtoModels.ReceiptScanResponse(items, subtotal.setScale(2, RoundingMode.HALF_UP),
                tax.setScale(2, RoundingMode.HALF_UP), tip.setScale(2, RoundingMode.HALF_UP),
                detectedTotal.setScale(2, RoundingMode.HALF_UP), duplicateSuspected, suspiciousTotal, warning);
    }

    public DtoModels.PaymentProofAnalysisResponse analyzeProof(DtoModels.PaymentProofAnalysisRequest request) {
        String text = ((Optional.ofNullable(request.proofText()).orElse("") + " "
                + Optional.ofNullable(request.proofUrl()).orElse(""))).trim();
        String ref = firstGroup(REF_PATTERN, text);
        BigDecimal amount = Optional.ofNullable(firstGroup(AMOUNT_PATTERN, text)).map(this::money).orElse(null);
        LocalDate date = parseDate(firstGroup(DATE_PATTERN, text));
        boolean suspicious = ref == null && text.length() > 20;
        String warning = suspicious ? "Could not detect a UPI/UTR/reference number from the proof text." : "";
        return new DtoModels.PaymentProofAnalysisResponse(ref, amount, date, suspicious, warning);
    }

    private String firstGroup(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private LocalDate parseDate(String value) {
        if (value == null) return null;
        List<DateTimeFormatter> formats = List.of(
                DateTimeFormatter.ISO_LOCAL_DATE,
                DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy"));
        for (DateTimeFormatter format : formats) {
            try {
                return LocalDate.parse(value, format);
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private BigDecimal money(String value) {
        return new BigDecimal(value.replace(",", ".")).setScale(2, RoundingMode.HALF_UP);
    }
}
