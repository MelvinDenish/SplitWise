package com.groupfinancetracker.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "notifications", indexes = {
        @Index(name = "idx_notifications_recipient_read", columnList = "recipient_id, read_at"),
        @Index(name = "idx_notifications_created", columnList = "created_at")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Notification {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private User recipient;

    @ManyToOne(optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @ManyToOne
    @JoinColumn(name = "group_id")
    private Group group;

    @ManyToOne
    @JoinColumn(name = "share_id")
    private Share share;

    @ManyToOne
    @JoinColumn(name = "settlement_id")
    private Settlement settlement;

    @Column(nullable = false, length = 60)
    private String type;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 1000)
    private String message;

    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    @Version
    private Long version;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
