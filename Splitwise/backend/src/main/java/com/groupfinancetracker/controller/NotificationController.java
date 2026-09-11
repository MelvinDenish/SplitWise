package com.groupfinancetracker.controller;

import com.groupfinancetracker.dto.DtoModels;
import com.groupfinancetracker.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {
    private final NotificationService notificationService;

    @GetMapping
    public List<DtoModels.NotificationResponse> list() {
        return notificationService.listForUser(actorId());
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount() {
        return Map.of("count", notificationService.unreadCount(actorId()));
    }

    @PostMapping("/{notificationId}/read")
    public DtoModels.NotificationResponse markRead(@PathVariable Long notificationId) {
        return notificationService.markRead(notificationId, actorId());
    }

    @PostMapping("/reminders/share")
    public DtoModels.NotificationResponse remindShare(@Valid @RequestBody DtoModels.ShareReminderRequest request) {
        return notificationService.remindShare(request, actorId());
    }

    @PostMapping("/reminders/pairwise")
    public DtoModels.NotificationResponse remindPairwise(@Valid @RequestBody DtoModels.PairwiseReminderRequest request) {
        return notificationService.remindPairwise(request, actorId());
    }

    private Long actorId() {
        Object details = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getDetails()
                : null;
        return details instanceof Long ? (Long) details : null;
    }
}
