package com.groupfinancetracker.settlement;

import java.math.BigDecimal;
import java.util.*;

/** Pure balance math — no Spring, no JPA. Unit-testable without a database. */
public final class SettlementCalculator {
    private SettlementCalculator() {}

    public static final BigDecimal EPSILON = new BigDecimal("0.005");
    private static final int EXACT_OPTIMIZER_LIMIT = 10;

    public record DebtRow(Long debtorId, Long payerId, BigDecimal amount) {}
    public record SettlementRow(Long fromUserId, Long toUserId, BigDecimal amount) {}
    public record Edge(Long fromId, Long toId, BigDecimal amount) {}
    public record Cycle(List<Long> userIds, BigDecimal cancellableAmount) {}
    public record OptimizationResult(List<Edge> edges, String strategy, int rawTransactionCount,
                                     int optimizedTransactionCount, int eliminatedTransactionCount,
                                     List<Cycle> cycles) {}

    /** net &gt; 0 ⇒ owed money (creditor); net &lt; 0 ⇒ owes (debtor). */
    public static Map<Long, BigDecimal> netBalances(List<DebtRow> debts, List<SettlementRow> settlements) {
        Map<Long, BigDecimal> net = new HashMap<>();
        for (DebtRow d : debts) {
            if (Objects.equals(d.debtorId(), d.payerId())) continue; // self-share contributes nothing
            net.merge(d.payerId(), d.amount(), BigDecimal::add);
            net.merge(d.debtorId(), d.amount().negate(), BigDecimal::add);
        }
        for (SettlementRow s : settlements) {
            net.merge(s.fromUserId(), s.amount(), BigDecimal::add);        // paid ⇒ discharges own debt
            net.merge(s.toUserId(), s.amount().negate(), BigDecimal::add); // received ⇒ reduces credit
        }
        return net;
    }

    /** Greedy min-cash-flow: repeatedly match the largest debtor to the largest creditor. */
    public static List<Edge> simplify(Map<Long, BigDecimal> net) {
        List<Node> debtors = new ArrayList<>();
        List<Node> creditors = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> e : net.entrySet()) {
            if (e.getValue().compareTo(EPSILON.negate()) < 0) debtors.add(new Node(e.getKey(), e.getValue()));
            else if (e.getValue().compareTo(EPSILON) > 0) creditors.add(new Node(e.getKey(), e.getValue()));
        }
        List<Edge> result = new ArrayList<>();
        while (!debtors.isEmpty() && !creditors.isEmpty()) {
            debtors.sort(Comparator.comparing(n -> n.balance));                 // most negative first
            creditors.sort((a, b) -> b.balance.compareTo(a.balance));           // most positive first
            Node debtor = debtors.get(0);
            Node creditor = creditors.get(0);
            BigDecimal amount = debtor.balance.negate().min(creditor.balance);
            debtor.balance = debtor.balance.add(amount);
            creditor.balance = creditor.balance.subtract(amount);
            if (amount.compareTo(EPSILON) > 0) {
                result.add(new Edge(debtor.id, creditor.id, amount));
            }
            if (debtor.balance.abs().compareTo(EPSILON) < 0) debtors.remove(0);
            if (creditor.balance.abs().compareTo(EPSILON) < 0) creditors.remove(0);
        }
        result.sort(Comparator.comparing((Edge e) -> e.fromId()).thenComparing(Edge::toId));
        return result;
    }

    /**
     * Uses exact debt minimization for small groups, then falls back to the greedy matcher for
     * larger groups. The exact search minimizes the number of transactions, which the greedy
     * largest-debtor/largest-creditor matcher cannot always guarantee.
     */
    public static OptimizationResult optimize(List<DebtRow> debts, List<SettlementRow> settlements) {
        Map<Long, BigDecimal> net = netBalances(debts, settlements);
        List<Edge> raw = rawPairwise(debts, settlements);
        List<Cycle> cycles = detectCycles(raw);
        List<Edge> edges = simplifyOptimal(net);
        String strategy = nonZeroBalanceCount(net) <= EXACT_OPTIMIZER_LIMIT ? "EXACT_MIN_TRANSACTIONS" : "GREEDY_LARGE_GROUP";
        int eliminated = Math.max(0, raw.size() - edges.size());
        return new OptimizationResult(edges, strategy, raw.size(), edges.size(), eliminated, cycles);
    }

    public static List<Edge> simplifyOptimal(Map<Long, BigDecimal> net) {
        List<BalanceNode> balances = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> e : net.entrySet()) {
            if (e.getValue().abs().compareTo(EPSILON) >= 0) {
                balances.add(new BalanceNode(e.getKey(), e.getValue()));
            }
        }
        balances.sort(Comparator.comparing(BalanceNode::id));
        if (balances.size() > EXACT_OPTIMIZER_LIMIT) {
            return simplify(net);
        }

        SearchState state = new SearchState();
        exactSearch(balances, new ArrayList<>(), state);
        if (state.best == null) {
            return List.of();
        }
        state.best.sort(Comparator.comparing((Edge e) -> e.fromId()).thenComparing(Edge::toId));
        return state.best;
    }

    private static void exactSearch(List<BalanceNode> balances, List<Edge> path, SearchState state) {
        int first = firstNonZero(balances);
        if (first == -1) {
            if (state.best == null || path.size() < state.best.size()) {
                state.best = new ArrayList<>(path);
            }
            return;
        }
        if (state.best != null && path.size() >= state.best.size()) return;

        BalanceNode current = balances.get(first);
        Set<BigDecimal> triedCounterBalances = new HashSet<>();
        for (int i = first + 1; i < balances.size(); i++) {
            BalanceNode counter = balances.get(i);
            if (current.balance.signum() == 0 || counter.balance.signum() == 0) continue;
            if (current.balance.signum() == counter.balance.signum()) continue;
            if (!triedCounterBalances.add(counter.balance)) continue;

            BigDecimal amount = current.balance.abs().min(counter.balance.abs());
            Edge edge = current.balance.signum() < 0
                    ? new Edge(current.id, counter.id, amount)
                    : new Edge(counter.id, current.id, amount);

            BigDecimal currentBefore = current.balance;
            BigDecimal counterBefore = counter.balance;
            current.balance = current.balance.add(current.balance.signum() < 0 ? amount : amount.negate());
            counter.balance = counter.balance.add(counter.balance.signum() < 0 ? amount : amount.negate());
            path.add(edge);

            exactSearch(balances, path, state);

            path.remove(path.size() - 1);
            current.balance = currentBefore;
            counter.balance = counterBefore;

            if (current.balance.add(counter.balance).abs().compareTo(EPSILON) < 0) break;
        }
    }

    private static int firstNonZero(List<BalanceNode> balances) {
        for (int i = 0; i < balances.size(); i++) {
            if (balances.get(i).balance.abs().compareTo(EPSILON) >= 0) return i;
        }
        return -1;
    }

    private static int nonZeroBalanceCount(Map<Long, BigDecimal> net) {
        int count = 0;
        for (BigDecimal balance : net.values()) {
            if (balance.abs().compareTo(EPSILON) >= 0) count++;
        }
        return count;
    }

    private static final class SearchState {
        List<Edge> best;
    }

    private static final class BalanceNode {
        final Long id;
        BigDecimal balance;
        BalanceNode(Long id, BigDecimal balance) { this.id = id; this.balance = balance; }
        Long id() { return id; }
    }

    private static final class Node {
        final Long id;
        BigDecimal balance;
        Node(Long id, BigDecimal balance) { this.id = id; this.balance = balance; }
    }

    /**
     * Net balance between every pair of users, considering only debts/settlements directly
     * between the two of them -- unlike {@link #simplify}, this does not redirect a debt
     * through a third party. Useful for showing "here's what this simplified payment is
     * actually made of" when a net edge is the product of a circular/indirect debt chain
     * (e.g. A owes B, B owes C, C owes A collapsing into a single payment).
     */
    public static List<Edge> rawPairwise(List<DebtRow> debts, List<SettlementRow> settlements) {
        Map<Long, Map<Long, BigDecimal>> owed = new HashMap<>(); // owed[creditor][debtor] = amount debtor owes creditor
        for (DebtRow d : debts) {
            if (Objects.equals(d.debtorId(), d.payerId())) continue;
            owed.computeIfAbsent(d.payerId(), k -> new HashMap<>())
                    .merge(d.debtorId(), d.amount(), BigDecimal::add);
        }
        for (SettlementRow s : settlements) {
            // fromUser paid toUser directly, discharging what fromUser owed toUser.
            owed.computeIfAbsent(s.toUserId(), k -> new HashMap<>())
                    .merge(s.fromUserId(), s.amount().negate(), BigDecimal::add);
        }
        Set<Long> ids = new TreeSet<>();
        owed.forEach((creditor, debtors) -> { ids.add(creditor); ids.addAll(debtors.keySet()); });
        List<Long> idList = new ArrayList<>(ids);
        List<Edge> result = new ArrayList<>();
        for (int i = 0; i < idList.size(); i++) {
            for (int j = i + 1; j < idList.size(); j++) {
                Long a = idList.get(i), b = idList.get(j);
                BigDecimal bOwesA = owed.getOrDefault(a, Map.of()).getOrDefault(b, BigDecimal.ZERO);
                BigDecimal aOwesB = owed.getOrDefault(b, Map.of()).getOrDefault(a, BigDecimal.ZERO);
                BigDecimal net = bOwesA.subtract(aOwesB); // positive => b owes a
                if (net.compareTo(EPSILON) > 0) result.add(new Edge(b, a, net));
                else if (net.negate().compareTo(EPSILON) > 0) result.add(new Edge(a, b, net.negate()));
            }
        }
        result.sort(Comparator.comparing((Edge e) -> e.fromId()).thenComparing(Edge::toId));
        return result;
    }

    public static List<Cycle> detectCycles(List<Edge> edges) {
        Map<Long, List<Edge>> graph = new TreeMap<>();
        for (Edge edge : edges) {
            graph.computeIfAbsent(edge.fromId(), k -> new ArrayList<>()).add(edge);
            graph.computeIfAbsent(edge.toId(), k -> new ArrayList<>());
        }
        graph.values().forEach(list -> list.sort(Comparator.comparing(Edge::toId)));

        List<Cycle> cycles = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Long start : graph.keySet()) {
            findCycles(start, start, graph, new ArrayList<>(), new HashSet<>(), cycles, seen);
        }
        return cycles;
    }

    private static void findCycles(Long start, Long current, Map<Long, List<Edge>> graph, List<Edge> path,
                                   Set<Long> visited, List<Cycle> cycles, Set<String> seen) {
        visited.add(current);
        for (Edge edge : graph.getOrDefault(current, List.of())) {
            if (edge.toId().equals(start) && !path.isEmpty()) {
                List<Edge> cycleEdges = new ArrayList<>(path);
                cycleEdges.add(edge);
                List<Long> userIds = new ArrayList<>();
                userIds.add(start);
                for (Edge cycleEdge : cycleEdges) userIds.add(cycleEdge.toId());
                String key = canonicalCycleKey(userIds);
                if (seen.add(key)) {
                    BigDecimal cancellable = cycleEdges.stream()
                            .map(Edge::amount)
                            .min(BigDecimal::compareTo)
                            .orElse(BigDecimal.ZERO);
                    cycles.add(new Cycle(userIds, cancellable));
                }
            } else if (!visited.contains(edge.toId()) && edge.toId().compareTo(start) >= 0) {
                path.add(edge);
                findCycles(start, edge.toId(), graph, path, visited, cycles, seen);
                path.remove(path.size() - 1);
            }
        }
        visited.remove(current);
    }

    private static String canonicalCycleKey(List<Long> userIdsWithReturn) {
        List<Long> ids = new ArrayList<>(userIdsWithReturn.subList(0, userIdsWithReturn.size() - 1));
        int minIndex = 0;
        for (int i = 1; i < ids.size(); i++) {
            if (ids.get(i).compareTo(ids.get(minIndex)) < 0) minIndex = i;
        }
        List<Long> rotated = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            rotated.add(ids.get((minIndex + i) % ids.size()));
        }
        return rotated.toString();
    }
}
