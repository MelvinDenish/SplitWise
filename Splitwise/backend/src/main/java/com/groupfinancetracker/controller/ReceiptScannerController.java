package com.groupfinancetracker.controller;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.service.ReceiptScannerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/receipt-scanner")
@RequiredArgsConstructor
public class ReceiptScannerController {
    private final ReceiptScannerService receiptScannerService;

    @PostMapping("/scan")
    public DtoModels.ReceiptScanResponse scan(@RequestBody DtoModels.ReceiptScanRequest request) {
        return receiptScannerService.scan(request);
    }

    @PostMapping("/proof")
    public DtoModels.PaymentProofAnalysisResponse analyzeProof(
            @RequestBody DtoModels.PaymentProofAnalysisRequest request) {
        return receiptScannerService.analyzeProof(request);
    }
}
