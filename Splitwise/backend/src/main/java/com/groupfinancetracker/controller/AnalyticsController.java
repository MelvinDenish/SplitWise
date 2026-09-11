package com.groupfinancetracker.controller;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.service.AnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {
    private final AnalyticsService analyticsService;

    @GetMapping("/groups/{groupId}")
    public DtoModels.GroupAnalyticsResponse groupAnalytics(@PathVariable Long groupId) {
        return analyticsService.groupAnalytics(groupId, actorId());
    }

    private Long actorId() {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        return details instanceof Long ? (Long) details : null;
    }
}
