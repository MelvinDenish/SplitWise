package com.groupfinancetracker.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "payment_disputes", indexes = {
        @Index(name = "idx_dispute_share", columnList = "share_id"),
        @Index(name = "idx_dispute_created", columnList = "created_at")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PaymentDispute {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "share_id", nullable = false)
    private Share share;

    @ManyToOne(optional = false)
    @JoinColumn(name = "raised_by_id", nullable = false)
    private User raisedBy;

    @ManyToOne(optional = false)
    @JoinColumn(name = "against_user_id", nullable = false)
    private User againstUser;

    @Column(nullable = false, length = 1000)
    private String reason;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Version
    private Long version;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (status == null) status = "OPEN";
    }
}
