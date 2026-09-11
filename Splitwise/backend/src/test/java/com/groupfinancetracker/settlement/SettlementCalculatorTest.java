package com.groupfinancetracker.settlement;

import com.groupfinancetracker.settlement.SettlementCalculator.DebtRow;
import com.groupfinancetracker.settlement.SettlementCalculator.Edge;
import com.groupfinancetracker.settlement.SettlementCalculator.SettlementRow;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SettlementCalculatorTest {
    private static BigDecimal money(String v) { return new BigDecimal(v); }

    @Test
    void selfShareIsIgnored() {
        var net = SettlementCalculator.netBalances(
                List.of(new DebtRow(1L, 1L, money("50"))), List.of());
        assertThat(net.getOrDefault(1L, BigDecimal.ZERO)).isEqualByComparingTo("0");
    }

    @Test
    void confirmedShareEquivalentSettlementNetsToZero() {
        var net = SettlementCalculator.netBalances(
                List.of(new DebtRow(1L, 2L, money("28"))),
                List.of(new SettlementRow(1L, 2L, money("28"))));
        assertThat(net.getOrDefault(1L, BigDecimal.ZERO)).isEqualByComparingTo("0");
        assertThat(net.getOrDefault(2L, BigDecimal.ZERO)).isEqualByComparingTo("0");
    }

    @Test
    void settlingNetEdgeLeavesUnrelatedDebtIntact() {
        // A=1 owes B=2 100 ; B owes C=3 100 ; A owes D=4 30
        var debts = List.of(
                new DebtRow(1L, 2L, money("100")),
                new DebtRow(2L, 3L, money("100")),
                new DebtRow(1L, 4L, money("30")));
        // settle simplified edge A->C 100
        var net = SettlementCalculator.netBalances(
                debts, List.of(new SettlementRow(1L, 3L, money("100"))));
        assertThat(net.getOrDefault(1L, BigDecimal.ZERO)).isEqualByComparingTo("-30");
        assertThat(net.getOrDefault(2L, BigDecimal.ZERO)).isEqualByComparingTo("0");
        assertThat(net.getOrDefault(3L, BigDecimal.ZERO)).isEqualByComparingTo("0");
        assertThat(net.getOrDefault(4L, BigDecimal.ZERO)).isEqualByComparingTo("30");
    }

    @Test
    void simplifyProducesMinimalEdge() {
        var net = SettlementCalculator.netBalances(List.of(
                new DebtRow(1L, 2L, money("100")),
                new DebtRow(2L, 3L, money("100"))), List.of());
        List<Edge> edges = SettlementCalculator.simplify(net);
        assertThat(edges).hasSize(1);
        assertThat(edges.get(0).fromId()).isEqualTo(1L);
        assertThat(edges.get(0).toId()).isEqualTo(3L);
        assertThat(edges.get(0).amount()).isEqualByComparingTo("100");
    }

    @Test
    void partialSettlementReducesEdge() {
        var net = SettlementCalculator.netBalances(
                List.of(new DebtRow(1L, 2L, money("100"))),
                List.of(new SettlementRow(1L, 2L, money("40"))));
        List<Edge> edges = SettlementCalculator.simplify(net);
        assertThat(edges).hasSize(1);
        assertThat(edges.get(0).amount()).isEqualByComparingTo("60");
    }

    @Test
    void exactOptimizerCanBeatGreedyTransactionCount() {
        var net = java.util.Map.of(
                1L, money("-5"),
                2L, money("-4"),
                3L, money("4"),
                4L, money("3"),
                5L, money("2"));

        assertThat(SettlementCalculator.simplify(net)).hasSize(4);

        List<Edge> edges = SettlementCalculator.simplifyOptimal(net);
        assertThat(edges).hasSize(3);
        assertThat(edges).anySatisfy(e -> {
            assertThat(e.fromId()).isEqualTo(1L);
            assertThat(e.toId()).isEqualTo(4L);
            assertThat(e.amount()).isEqualByComparingTo("3");
        });
        assertThat(edges).anySatisfy(e -> {
            assertThat(e.fromId()).isEqualTo(1L);
            assertThat(e.toId()).isEqualTo(5L);
            assertThat(e.amount()).isEqualByComparingTo("2");
        });
        assertThat(edges).anySatisfy(e -> {
            assertThat(e.fromId()).isEqualTo(2L);
            assertThat(e.toId()).isEqualTo(3L);
            assertThat(e.amount()).isEqualByComparingTo("4");
        });
    }

    @Test
    void optimizationReportsCircularDebtCyclesAndSavings() {
        var debts = List.of(
                new DebtRow(1L, 2L, money("100")),
                new DebtRow(2L, 3L, money("100")),
                new DebtRow(3L, 1L, money("40")));

        var result = SettlementCalculator.optimize(debts, List.of());

        assertThat(result.strategy()).isEqualTo("EXACT_MIN_TRANSACTIONS");
        assertThat(result.rawTransactionCount()).isEqualTo(3);
        assertThat(result.optimizedTransactionCount()).isEqualTo(1);
        assertThat(result.eliminatedTransactionCount()).isEqualTo(2);
        assertThat(result.cycles()).hasSize(1);
        assertThat(result.cycles().get(0).cancellableAmount()).isEqualByComparingTo("40");
    }
}
