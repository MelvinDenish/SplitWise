package com.groupfinancetracker.repository;

import com.groupfinancetracker.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    @Query("select n from Notification n " +
            "join fetch n.recipient " +
            "join fetch n.sender " +
            "left join fetch n.group " +
            "left join fetch n.share " +
            "left join fetch n.settlement " +
            "where n.recipient.id = ?1 " +
            "order by n.createdAt desc")
    List<Notification> findByRecipientId(Long recipientId);

    long countByRecipient_IdAndReadAtIsNull(Long recipientId);
}
