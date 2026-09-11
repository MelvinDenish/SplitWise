package com.groupfinancetracker.repository;

import com.groupfinancetracker.entity.SubEvent;
import java.math.BigDecimal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface SubEventRepository extends JpaRepository<SubEvent, Long> {
    List<SubEvent> findByEvent_Id(Long eventId);

    List<SubEvent> findByEvent_Group_Id(Long groupId);

    List<SubEvent> findByIsRecurringTrueAndNextRunDateBefore(java.time.Instant now);

    @Query("""
        select distinct se from SubEvent se
        left join fetch se.shares s
        left join fetch s.user
        left join fetch s.paymentStatus
        join fetch se.payer
        join fetch se.event ev
        join fetch ev.group
        where se.payer.id = ?1 or s.user.id = ?1
        order by se.year desc, se.weekNumber desc, se.subEventDate desc
        """)
    List<SubEvent> findInvolvedSubEvents(Long userId);

    @Query("select min(se.subEventDate) from SubEvent se")
    LocalDate findEarliestSubEventDate();

    @Query("select distinct se.year, se.weekNumber from SubEvent se order by se.year asc, se.weekNumber asc")
    List<Object[]> listDistinctWeeksAsc();

    List<SubEvent> findByYearAndWeekNumber(Integer year, Integer weekNumber);

    @Query("select distinct se.year, se.weekNumber from SubEvent se where se.event.group.id = ?1 order by se.year asc, se.weekNumber asc")
    List<Object[]> listDistinctWeeksAscByGroup(Long groupId);

    List<SubEvent> findByEvent_Group_IdAndYearAndWeekNumber(Long groupId, Integer year, Integer weekNumber);

    @Query("select se.weekNumber, se.year, count(distinct se.event.id) from SubEvent se where se.event.group.id = ?1 group by se.weekNumber, se.year order by se.year desc, se.weekNumber desc")
    List<Object[]> listWeeksWithCountsByGroup(Long groupId);

    @Query("select distinct se.event.id from SubEvent se where se.event.group.id = ?1 and se.weekNumber = ?2 and se.year = ?3")
    List<Long> findEventIdsByGroupAndWeek(Long groupId, Integer weekNumber, Integer year);

    @Query("select coalesce(sum(se.totalAmount), 0) from SubEvent se where se.event.id = ?1 and se.payer.id = ?2")
    BigDecimal sumTotalByEventAndPayer(Long eventId, Long payerId);

    @Query("select coalesce(sum(se.totalAmount), 0) from SubEvent se where se.event.id = ?1")
    BigDecimal sumTotalByEvent(Long eventId);

    @Query("select coalesce(sum(se.totalAmount), 0) from SubEvent se where se.event.group.id = ?1 and se.payer.id = ?2")
    BigDecimal sumTotalByGroupAndPayer(Long groupId, Long payerId);

    @Query("select coalesce(sum(se.totalAmount), 0) from SubEvent se where se.event.group.id = ?1")
    BigDecimal sumTotalByGroup(Long groupId);
}
