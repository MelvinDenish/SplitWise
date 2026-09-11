import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import {
  ArrowRight, ArrowLeft, Bell, CheckCircle2, Clock, TrendingDown, ChevronDown, ChevronUp, Receipt, History, GitMerge,
} from 'lucide-react';
import { groupAPI, notificationAPI, subEventAPI } from '../lib/api';
import { Group } from '../types';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const fmtDateTime = (d?: string) => (d ? new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const pairKey = (a: any, b: any) => [String(a), String(b)].sort().join('|');

export const GroupSettlements = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast, ToastContainer } = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const [pairwise, setPairwise] = useState<any[]>([]);
  const [rawPairwise, setRawPairwise] = useState<any[]>([]);
  const [optimization, setOptimization] = useState<any | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [remindingKey, setRemindingKey] = useState<string | null>(null);

  const [ledger, setLedger] = useState<{ shares: any[]; settlements: any[] } | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markTarget, setMarkTarget] = useState<{ debtorId: any; creditorId: any; debtorName: string; creditorName: string; amount: number } | null>(null);
  const [txnRef, setTxnRef] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!groupId) return;
    try {
      const [groupRes, pairwiseRes, pendingRes] = await Promise.all([
        groupAPI.getById(groupId),
        groupAPI.getGroupPairwise(groupId),
        groupAPI.getPendingSettlements(groupId),
      ]);
      setGroup(groupRes.data);
      setPairwise(pairwiseRes.data?.pairwiseBalances || []);
      setRawPairwise(pairwiseRes.data?.rawPairwiseBalances || []);
      setOptimization(pairwiseRes.data?.optimization || null);
      setPending(pendingRes.data || []);
    } catch {
      showToast('Failed to load settlements', 'error');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadLedger = useCallback(async () => {
    if (!groupId) return;
    setLedgerLoading(true);
    try {
      const res = await groupAPI.getGroupLedger(groupId);
      setLedger({ shares: res.data?.shares || [], settlements: res.data?.settlements || [] });
    } catch {
      showToast('Failed to load settlement details', 'error');
    } finally {
      setLedgerLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Loaded eagerly (not just on row-expand) so the standalone Settlement History section below has data too.
  useEffect(() => { loadLedger(); }, [loadLedger]);

  const toggleExpand = (a: any, b: any) => {
    const key = pairKey(a, b);
    setExpandedPair(expandedPair === key ? null : key);
  };

  const pendingByPair = new Map<string, any>();
  for (const p of pending) pendingByPair.set(pairKey(p.fromUserId, p.toUserId), p);

  const openMarkModal = (debtorId: any, creditorId: any, debtorName: string, creditorName: string, amount: number) => {
    setMarkTarget({ debtorId, creditorId, debtorName, creditorName, amount });
    setTxnRef('');
    setProofUrl('');
    setShowMarkModal(true);
  };

  const submitMark = async () => {
    if (!markTarget || !groupId) return;
    setIsSubmitting(true);
    try {
      await subEventAPI.settlePairwise(Number(groupId), null, markTarget.debtorId, markTarget.creditorId, markTarget.amount, txnRef, proofUrl);
      showToast('Marked as paid — waiting for confirmation', 'success');
      setShowMarkModal(false);
      setMarkTarget(null);
      fetchAll();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to mark as paid', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmSettlement = async (settlementId: any) => {
    try {
      await subEventAPI.confirmPairwiseSettlement(settlementId);
      showToast('Payment confirmed and settled!', 'success');
      fetchAll();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to confirm', 'error');
    }
  };

  const remindPairwise = async (item: any) => {
    if (!groupId) return;
    const key = pairKey(item.user1Id, item.user2Id);
    setRemindingKey(key);
    try {
      await notificationAPI.remindPairwise(groupId, item.user1Id, item.user2Id, Number(item.amount));
      showToast(`Reminder sent to ${item.user1}`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to send reminder', 'error');
    } finally {
      setRemindingKey(null);
    }
  };

  // Best-effort label for a past settlement: was it a straightforward direct payment, or did it
  // depend on the group's wider debt graph (a circular/indirect chain collapsed into one payment)?
  // Uses the current raw pairwise snapshot since we don't retroactively record this per-settlement.
  const isLikelyCircular = (fromUserId: any, toUserId: any) => {
    const hasDirectRawEdge = rawPairwise.some((r: any) =>
      (String(r.user1Id) === String(fromUserId) && String(r.user2Id) === String(toUserId)) ||
      (String(r.user1Id) === String(toUserId) && String(r.user2Id) === String(fromUserId)));
    return rawPairwise.length > 1 || !hasDirectRawEdge;
  };

  const confirmedSettlements = [...ledger?.settlements || []]
    .filter((s: any) => !s.status || s.status === 'CONFIRMED')
    .sort((a: any, b: any) =>
      new Date(b.confirmedAt || b.createdAt).getTime() - new Date(a.confirmedAt || a.createdAt).getTime());

  const renderBreakdown = (userAId: any, userBId: any) => {
    if (ledgerLoading) {
      return <p className="text-xs text-gray-500 dark:text-gray-400 py-3">Loading breakdown…</p>;
    }
    if (!ledger) return null;

    const directShares = ledger.shares.filter((s: any) =>
      (String(s.debtorId) === String(userAId) && String(s.creditorId) === String(userBId)) ||
      (String(s.debtorId) === String(userBId) && String(s.creditorId) === String(userAId)));
    const directSettlements = ledger.settlements.filter((s: any) =>
      (String(s.fromUserId) === String(userAId) && String(s.toUserId) === String(userBId)) ||
      (String(s.fromUserId) === String(userBId) && String(s.toUserId) === String(userAId)));
    // "Circular" for display purposes: there's more going on in the group's raw debt graph
    // than just this one pair, so this simplified payment likely involves a third party's debts.
    const hasDirectRawEdge = rawPairwise.some((r: any) =>
      (String(r.user1Id) === String(userAId) && String(r.user2Id) === String(userBId)) ||
      (String(r.user1Id) === String(userBId) && String(r.user2Id) === String(userAId)));
    const isCircular = rawPairwise.length > 1 || !hasDirectRawEdge;

    return (
      <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-gray-900/40 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Direct expenses between these two members
          </p>
          {directShares.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              No expenses directly between them — this payment exists only because of the group's overall net position (see below).
            </p>
          ) : (
            <div className="space-y-1.5">
              {directShares.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{s.description}</span>
                    <span className="text-gray-400 dark:text-gray-500 ml-2">{fmtDate(s.subEventDate)}</span>
                    <div className="text-gray-500 dark:text-gray-400 mt-0.5">{s.debtorName} owed {s.creditorName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-white">₹{Number(s.amount).toFixed(2)}</div>
                    <div className="text-[10px] text-gray-400">{s.status || 'CONFIRMED'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {directSettlements.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Prior settlements between these two members
            </p>
            <div className="space-y-1.5">
              {directSettlements.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{s.fromUserName} → {s.toUserName}</span>
                    <div className="text-gray-500 dark:text-gray-400 mt-0.5">{s.note} · {fmtDateTime(s.confirmedAt || s.markedAt || s.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-white">₹{Number(s.amount).toFixed(2)}</div>
                    <div className="text-[10px] text-gray-400">{s.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isCircular && (
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
              This is part of a group-wide simplification (circular/indirect debt). The raw debts across everyone that produced it:
            </p>
            <div className="space-y-1.5">
              {rawPairwise.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{r.user1}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-gray-700 dark:text-gray-200">{r.user2}</span>
                  <span className="ml-auto font-semibold text-gray-900 dark:text-white">₹{Number(r.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  const awaitingYourConfirmation = pending.filter((p: any) => user && String(p.toUserId) === String(user.id));
  const awaitingOtherParty = pending.filter((p: any) => user && String(p.fromUserId) === String(user.id));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <ToastContainer />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate(`/groups/${groupId}`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to {group?.name || 'group'}
        </button>

        <div className="flex items-center gap-2 mb-6">
          <TrendingDown className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settlements — {group?.name}</h1>
        </div>

        {/* Awaiting your confirmation */}
        {awaitingYourConfirmation.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md mb-6 overflow-hidden border border-amber-200 dark:border-amber-900/50">
            <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/50">
              <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Awaiting your confirmation ({awaitingYourConfirmation.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {awaitingYourConfirmation.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      <b>{p.fromUserName}</b> says they paid you <b>₹{Number(p.amount).toFixed(2)}</b>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Marked {fmtDateTime(p.markedAt)}{p.transactionRef ? ` · Ref: ${p.transactionRef}` : ''}
                      {p.proofUrl && <> · <a href={p.proofUrl} target="_blank" rel="noreferrer" className="underline">proof</a></>}
                    </p>
                  </div>
                  <button
                    onClick={() => confirmSettlement(p.id)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5 flex-shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Confirm Received
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Awaiting the other party */}
        {awaitingOtherParty.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md mb-6 overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Awaiting confirmation from the other party ({awaitingOtherParty.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {awaitingOtherParty.map((p: any) => (
                <div key={p.id} className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                  You marked <b>₹{Number(p.amount).toFixed(2)}</b> to <b>{p.toUserName}</b> as paid — waiting for them to confirm.
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Simplified payments */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-950/30 dark:to-primary-900/20">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Simplified Payments</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              The fewest payments needed to settle everyone up. Click a row to see exactly what it's made of.
            </p>
            {optimization && (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200 border border-primary-100 dark:border-primary-900/40">
                  {optimization.strategy === 'EXACT_MIN_TRANSACTIONS' ? 'Exact optimizer' : 'Greedy large-group optimizer'}
                </span>
                <span className="px-2 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200 border border-primary-100 dark:border-primary-900/40">
                  {optimization.rawTransactionCount} raw → {optimization.optimizedTransactionCount} optimized
                </span>
                {optimization.eliminatedTransactionCount > 0 && (
                  <span className="px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40">
                    {optimization.eliminatedTransactionCount} payment{optimization.eliminatedTransactionCount === 1 ? '' : 's'} eliminated
                  </span>
                )}
                {optimization.cycles?.length > 0 && (
                  <span className="px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900/40">
                    {optimization.cycles.length} circular debt cycle{optimization.cycles.length === 1 ? '' : 's'} found
                  </span>
                )}
              </div>
            )}
          </div>

          {pairwise.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-primary-500 mb-3" />
              <p className="font-semibold text-gray-700 dark:text-gray-200">All settled up! 🎉</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {pairwise.map((item: any, idx: number) => {
                const isDebtor = user && String(item.user1Id) === String(user.id);
                const isCreditor = user && String(item.user2Id) === String(user.id);
                const key = pairKey(item.user1Id, item.user2Id);
                const isExpanded = expandedPair === key;
                const alreadyPending = pendingByPair.get(pairKey(item.user1Id, item.user2Id));

                return (
                  <div key={idx}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4">
                      <button
                        onClick={() => toggleExpand(item.user1Id, item.user2Id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {item.user1}{isDebtor ? ' (You)' : ''}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                          {item.user2}
                        </span>
                      </button>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-lg font-bold text-primary-600 dark:text-primary-400">₹{Number(item.amount).toFixed(2)}</span>
                        {alreadyPending ? (
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Pending confirmation
                          </span>
                        ) : isDebtor ? (
                          <button
                            onClick={() => openMarkModal(item.user1Id, item.user2Id, item.user1, item.user2, Number(item.amount))}
                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white"
                          >
                            Mark as Paid
                          </button>
                        ) : isCreditor ? (
                          <button
                            onClick={() => remindPairwise(item)}
                            disabled={remindingKey === key}
                            className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-800 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-200 flex items-center gap-1.5"
                          >
                            <Bell className="w-4 h-4" /> {remindingKey === key ? 'Sending…' : 'Remind'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">not involved</span>
                        )}
                      </div>
                    </div>
                    {isExpanded && renderBreakdown(item.user1Id, item.user2Id)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Settlement History */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700 mt-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 text-left"
          >
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Settlement History</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Every payment that's been confirmed, and whether it was a direct payment or part of a group-wide circular-debt optimization.
                </p>
              </div>
            </div>
            {showHistory ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          </button>

          {showHistory && (
            ledgerLoading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">Loading history…</p>
            ) : confirmedSettlements.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-6 text-center">No settlements confirmed yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {confirmedSettlements.map((s: any) => {
                  const circular = isLikelyCircular(s.fromUserId, s.toUserId);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-4 px-6 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-gray-800 dark:text-gray-100 truncate">
                          {s.fromUserName} <ArrowRight className="inline w-3 h-3 mx-1 text-gray-400" /> {s.toUserName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            circular
                              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                          title={circular ? 'Part of a group-wide circular/indirect debt optimization' : 'A direct payment between these two people'}
                        >
                          {circular ? <GitMerge className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                          {circular ? 'Circular-optimized' : 'Direct'}
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">₹{Number(s.amount).toFixed(2)}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-28 text-right">{fmtDate(s.confirmedAt || s.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* Mark as Paid modal */}
      {showMarkModal && markTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Mark as Paid</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              ₹{markTarget.amount.toFixed(2)} to {markTarget.creditorName}. They'll need to confirm before this counts as settled.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Transaction Ref ID (e.g. UPI Ref / UTR / Bank ID)</label>
                <input
                  type="text"
                  placeholder="e.g. 318285918239"
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Proof URL (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. https://imgur.com/your-receipt-image"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={submitMark}
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-bold rounded transition w-full"
              >
                {isSubmitting ? 'Submitting…' : 'Submit & Mark as Paid'}
              </button>
              <button
                onClick={() => setShowMarkModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded transition w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
