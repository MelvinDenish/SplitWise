package com.groupfinancetracker.repository;

import com.groupfinancetracker.entity.PaymentDispute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PaymentDisputeRepository extends JpaRepository<PaymentDispute, Long> {
    @Query("select d from PaymentDispute d join fetch d.share s join fetch d.raisedBy join fetch d.againstUser where s.subEvent.event.group.id = ?1 order by d.createdAt desc")
    List<PaymentDispute> findByGroupId(Long groupId);

    List<PaymentDispute> findByShare_IdOrderByCreatedAtDesc(Long shareId);
}
