import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Calendar, Plus, DollarSign, Users, CheckCircle, QrCode, ExternalLink, ArrowRight, TrendingDown } from 'lucide-react';
import { eventAPI, subEventAPI, groupAPI, paymentDisputeAPI, receiptScannerAPI } from '../lib/api';
import { Event, SubEvent } from '../types';
import { useToast } from '../components/Toast';
import { CreateSubEventModal } from '../components/CreateSubEventModal';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

// Normalize backend status strings to display labels
const normalizeStatus = (status: string): string => {
  switch (status) {
    case 'UNPAID':   return 'PENDING';
    case 'MARKED_AS_PAID': return 'PAID';
    case 'CONFIRMED': return 'CONFIRMED';
    // Mock mode values pass through unchanged
    case 'PENDING': return 'PENDING';
    case 'PAID': return 'PAID';
    default: return status;
  }
};

// Check if share is in a state where the sharer can mark as paid
const canMarkPaid = (status: string) =>
  status === 'UNPAID' || status === 'PENDING';

// Check if share is in a state where the payer can confirm
const canConfirm = (status: string) =>
  status === 'MARKED_AS_PAID' || status === 'PAID';

export const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [subEvents, setSubEvents] = useState<SubEvent[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSubEvent, setEditingSubEvent] = useState<any>(null);
  const [settlementSummary, setSettlementSummary] = useState<any[]>([]);
  const [rawSettlementSummary, setRawSettlementSummary] = useState<any[]>([]);
  const [showRawBreakdown, setShowRawBreakdown] = useState(false);

  // UPI states
  const [showQRModal, setShowQRModal] = useState(false);
  const [activeUpiUrl, setActiveUpiUrl] = useState('');
  const [activeUpiUser, setActiveUpiUser] = useState('');
  const [activeUpiAmount, setActiveUpiAmount] = useState(0);

  // Proof submission states
  const [showProofModal, setShowProofModal] = useState(false);
  const [activeShareId, setActiveShareId] = useState<string | number | null>(null);
  const [activeSubEventId, setActiveSubEventId] = useState<string | number | null>(null);
  const [txnRef, setTxnRef] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofText, setProofText] = useState('');
  const [isAnalyzingProof, setIsAnalyzingProof] = useState(false);

  const { user } = useAuth();
  const { showToast, ToastContainer } = useToast();

  const getMutualSettlementNote = (payerId: string | number, payerName: string) => {
    if (!user) return null;
    const match = settlementSummary.find(item => 
      (String(item.user1Id) === String(user.id) && String(item.user2Id) === String(payerId)) ||
      (String(item.user2Id) === String(user.id) && String(item.user1Id) === String(payerId))
    );
    if (!match) return null;

    const debtorName = match.user1;
    const creditorName = match.user2;
    const amount = Number(match.amount).toFixed(2);

    return (
      <div className="mt-3 p-2.5 bg-blue-50 dark:bg-blue-950/20 text-blue-750 dark:text-blue-300 rounded border border-blue-100 dark:border-blue-900/30 text-xs">
        💡 You have mutual debts with {payerName}. Settle the net balance of <b>₹{amount}</b> ({debtorName} owes {creditorName}) at the bottom of the page instead of paying this share manually!
      </div>
    );
  };

  const isMockMode = () => localStorage.getItem('token') === 'mock-jwt-token-for-testing';

  const fetchEventData = async () => {
    if (!eventId) return;

    try {
      // These are all independent of each other -- fetch in parallel instead of chaining
      // sequentially (each round trip carries real network latency).
      const [eventResponse, subEventsResponse, settlementRes] = await Promise.all([
        eventAPI.getById(eventId),
        subEventAPI.getByEvent(eventId),
        isMockMode()
          ? Promise.resolve({ data: {} as any })
          : api.get(`/settlements/event/${eventId}/pairwise`).catch(() => ({ data: {} as any })),
      ]);
      setEvent(eventResponse.data);
      setSubEvents(subEventsResponse.data);
      setSettlementSummary(settlementRes.data?.pairwiseBalances || []);
      setRawSettlementSummary(settlementRes.data?.rawPairwiseBalances || []);

      // Group members depend on the event's groupId, so this fetch has to follow the above.
      // GroupResponse embeds full member profiles now, so no separate GET /users call is needed.
      const groupRes = await groupAPI.getById(eventResponse.data.groupId);
      setGroupMembers(groupRes.data.members || []);
    } catch (error) {
      showToast('Failed to load event', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEventData();
  }, [eventId]);

  const handleSubEventCreated = () => {
    setShowCreateModal(false);
    setEditingSubEvent(null);
    fetchEventData();
  };

  const handleDeleteSubEvent = async (id: string | number) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try {
      await subEventAPI.delete(id);
      showToast('Expense deleted', 'success');
      fetchEventData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to delete expense', 'error');
    }
  };

  const handleStopRecurring = async (id: string | number) => {
    if (!window.confirm('Stop this recurring expense? Existing copies stay; no new ones will be created.')) return;
    try {
      await subEventAPI.stopRecurring(id);
      showToast('Recurring stopped', 'success');
      fetchEventData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to stop recurring', 'error');
    }
  };

  const handleMarkPaid = (shareId: string | number, subEventId: string | number) => {
    setActiveShareId(shareId);
    setActiveSubEventId(subEventId);
    setTxnRef('');
    setProofUrl('');
    setProofText('');
    setShowProofModal(true);
  };

  const analyzeProof = async () => {
    setIsAnalyzingProof(true);
    try {
      const res = await receiptScannerAPI.analyzeProof(proofText, proofUrl);
      if (res.data?.transactionRef) setTxnRef(res.data.transactionRef);
      showToast(res.data?.warning || 'Proof details analyzed', res.data?.suspicious ? 'error' : 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to analyze proof', 'error');
    } finally {
      setIsAnalyzingProof(false);
    }
  };

  const submitPaymentProof = async () => {
    if (!activeShareId || !activeSubEventId) return;
    try {
      await subEventAPI.markPaid(activeShareId, txnRef, proofUrl, activeSubEventId);
      showToast('Proof submitted and marked as paid!', 'success');
      setShowProofModal(false);
      fetchEventData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to submit proof', 'error');
    }
  };

  const handleConfirmPayment = async (shareId: string | number, subEventId: string | number) => {
    try {
      await subEventAPI.confirmPayment(shareId, subEventId);
      showToast('Payment confirmed!', 'success');
      fetchEventData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to confirm payment', 'error');
    }
  };

  const handleDisputePayment = async (shareId: string | number) => {
    const reason = window.prompt('Why are you disputing this payment proof?');
    if (!reason?.trim()) return;
    try {
      await paymentDisputeAPI.dispute(shareId, reason.trim());
      showToast('Dispute recorded in the payment audit trail', 'success');
      fetchEventData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to record dispute', 'error');
    }
  };

  const getStatusBadge = (rawStatus: string) => {
    const display = normalizeStatus(rawStatus);
    const badges: Record<string, string> = {
      PENDING: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
      PAID:    'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
      CONFIRMED: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    };
    return badges[display] || badges.PENDING;
  };

  // Compute event total from subevents if backend didn't return it
  const eventTotal = event?.totalAmount
    ? Number(event.totalAmount)
    : subEvents.reduce((sum, se) => sum + Number(se.totalAmount || 0), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-gray-600 dark:text-gray-400">Event not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Navbar />
      <ToastContainer />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{event.name || event.title}</h1>
          <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400 flex-wrap">
            <div className="flex items-center gap-2" title="The date the event happened">
              <Calendar className="w-5 h-5" />
              <span>{new Date(event.eventDate).toLocaleDateString()}</span>
            </div>
            {event.createdAt && (
              <span className="text-xs text-gray-400 dark:text-gray-500" title="When this event was added to the app">
                Added {new Date(event.createdAt).toLocaleDateString()}
              </span>
            )}
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
                ₹{eventTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Payments</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Payment
          </button>
        </div>

        {subEvents.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg">
            <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No payments yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create a payment to start tracking expenses for this event
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {subEvents.map((subEvent) => {
              // Find the current user's share in this subevent
              const userShare = (subEvent.sharers || subEvent.shares || []).find(
                (s: any) => String(s.userId) === String(user?.id)
              );
              const isPayer = String(subEvent.payerId) === String(user?.id);

              // Find payer details for UPI
              const payerUser = groupMembers.find(m => String(m.id) === String(subEvent.payerId));
              const payerUpi = payerUser?.upiId;
              const upiUrl = payerUpi
                ? `upi://pay?pa=${payerUpi}&pn=${encodeURIComponent(payerUser.name)}&am=${userShare?.amount || 0}&cu=INR&tn=${encodeURIComponent(subEvent.description)}`
                : '';

              return (
                <div
                  key={subEvent.id}
                  className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        {subEvent.description}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Paid by {payerUser?.name || 'Unknown'}{' '}
                        {payerUpi && <span className="text-xs text-primary-600 dark:text-primary-400">({payerUpi})</span>}
                      </p>
                      {subEvent.isRecurring && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs rounded font-medium">
                          ♻️ Recurring: {subEvent.recurringPeriod}
                        </span>
                      )}
                      {subEvent.isRecurring && (isPayer || String(subEvent.eventCreatorId) === String(user?.id)) && (
                        <button
                          onClick={() => handleStopRecurring(subEvent.id)}
                          className="inline-block mt-1 ml-2 px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        >
                          Stop recurring
                        </button>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        ₹{Number(subEvent.totalAmount).toFixed(2)}
                      </p>
                      {(isPayer || String(subEvent.eventCreatorId) === String(user?.id)) && (
                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            onClick={() => setEditingSubEvent(subEvent)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteSubEvent(subEvent.id)}
                            className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Shared between {(subEvent.sharers || subEvent.shares || []).length} people
                      </span>
                    </div>

                    <div className="space-y-2">
                      {(subEvent.sharers || subEvent.shares || []).map((sharer: any) => {
                        const isSharerPayer = String(sharer.userId) === String(subEvent.payerId);
                        const rawStatus: string = sharer.status || 'UNPAID';
                        const displayStatus = normalizeStatus(rawStatus);
                        const isCurrentUser = String(sharer.userId) === String(user?.id);

                        return (
                          <div
                            key={sharer.userId}
                            className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
                                <span className="text-white font-semibold text-sm">
                                  {sharer.userName ? sharer.userName.charAt(0).toUpperCase() : '?'}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {sharer.userName}{' '}
                                  {isSharerPayer && <span className="text-xs text-gray-500">(Payer)</span>}
                                  {isCurrentUser && !isSharerPayer && <span className="text-xs text-primary-500"> (You)</span>}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  ₹{Number(sharer.amount).toFixed(2)}
                                </p>
                                {sharer.transactionRef && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Ref ID: <span className="font-mono bg-gray-200 dark:bg-gray-800 px-1 rounded">{sharer.transactionRef}</span>
                                  </p>
                                )}
                                {sharer.proofUrl && (
                                  <p className="text-xs mt-1">
                                    <a
                                      href={sharer.proofUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary-600 dark:text-primary-400 underline font-medium hover:text-primary-700"
                                    >
                                      View Payment Proof 🔗
                                    </a>
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(rawStatus)}`}
                              >
                                {displayStatus}
                              </span>

                              {/* Payer can confirm a MARKED_AS_PAID share */}
                              {isPayer && canConfirm(rawStatus) && !isSharerPayer && (
                                <>
                                  <button
                                    onClick={() => handleConfirmPayment(sharer.id, subEvent.id)}
                                    className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition flex items-center gap-1"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Confirm Receipt
                                  </button>
                                  <button
                                    onClick={() => handleDisputePayment(sharer.id)}
                                    className="px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-200 rounded text-xs font-medium transition"
                                  >
                                    Dispute
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* UPI QR & App Link options for Borrowers */}
                    {userShare && canMarkPaid(userShare.status) && !isPayer && payerUpi && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mt-3 border border-blue-100 dark:border-blue-900/50">
                        <h4 className="font-semibold text-blue-800 dark:text-blue-300 text-sm flex items-center gap-1.5">
                          🇮🇳 UPI Payment Options
                        </h4>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Lender UPI: <span className="font-semibold">{payerUpi}</span>
                        </p>

                        <div className="flex flex-wrap gap-2 mt-3">
                          <a
                            href={upiUrl}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open UPI App
                          </a>

                          <button
                            onClick={() => {
                              setActiveUpiUrl(upiUrl);
                              setActiveUpiUser(payerUser.name);
                              setActiveUpiAmount(userShare.amount);
                              setShowQRModal(true);
                            }}
                            className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            Show QR Code
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mutual settlement hint */}
                    {userShare && canMarkPaid(userShare.status) && !isPayer && getMutualSettlementNote(subEvent.payerId, payerUser?.name || 'payer')}

                    {/* Mark as Paid button — only for the current user's share when UNPAID */}
                    {userShare && canMarkPaid(userShare.status) && !isPayer && (
                      <button
                        onClick={() => handleMarkPaid(userShare.id, subEvent.id)}
                        className="mt-4 w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg transition-colors font-medium text-sm"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Mark My Share as Paid (Upload Proof)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== Settlement Center ===== */}
        {settlementSummary.length > 0 && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-950/30 dark:to-indigo-950/20">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Settlement Center</h2>
                <span className="ml-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs rounded-full font-semibold">
                  {settlementSummary.length} pending
                </span>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                  Net balances · Circular debts resolved
                </p>
                {rawSettlementSummary.length > 0 && (
                  <button
                    onClick={() => setShowRawBreakdown(v => !v)}
                    className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {showRawBreakdown ? 'Hide' : 'Show'} direct debts ({rawSettlementSummary.length})
                  </button>
                )}
              </div>
            </div>

            {showRawBreakdown && rawSettlementSummary.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  These are the actual direct debts before simplification
                  {rawSettlementSummary.length > settlementSummary.length
                    ? ` — collapsed from ${rawSettlementSummary.length} direct debts into ${settlementSummary.length} payment${settlementSummary.length === 1 ? '' : 's'} above (circular/indirect debt resolved).`
                    : '.'}
                </p>
                <div className="space-y-1.5">
                  {rawSettlementSummary.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{item.user1}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-700 dark:text-gray-200">{item.user2}</span>
                      <span className="text-gray-400 dark:text-gray-500">·</span>
                      <span className="font-semibold text-gray-900 dark:text-white">₹{Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {settlementSummary.map((item: any, idx: number) => {
                const isDebtor   = user && String(item.user1Id) === String(user.id);
                const isCreditor = user && String(item.user2Id) === String(user.id);
                const isInvolved = isDebtor || isCreditor;

                return (
                  <div
                    key={idx}
                    className={`flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-4 transition ${
                      isDebtor   ? 'bg-gray-800/60 dark:bg-gray-800/40' :
                      isCreditor ? 'bg-primary-50/60 dark:bg-primary-950/20' : ''
                    }`}
                  >
                    {/* Direction label */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex flex-col items-start gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            isDebtor ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}>
                            {item.user1}{isDebtor ? ' (You)' : ''}
                          </span>
                          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            isCreditor ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}>
                            {item.user2}{isCreditor ? ' (You)' : ''}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 ${
                          isDebtor   ? 'text-gray-500 dark:text-gray-400' :
                          isCreditor ? 'text-primary-600 dark:text-primary-400' :
                                       'text-gray-500 dark:text-gray-400'
                        }`}>
                          {isDebtor   && `You owe ${item.user2} — this is the net after offsetting mutual payments`}
                          {isCreditor && `${item.user1} owes you — net after offsetting mutual payments`}
                          {!isInvolved && 'Settlement pending between these two members (you are not involved)'}
                        </p>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                          ₹{Number(item.amount).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">net amount</p>
                      </div>
                      {isInvolved && (
                        <span className={`text-xs font-semibold ${isDebtor ? 'text-gray-500 dark:text-gray-400' : 'text-primary-600 dark:text-primary-400'}`}>
                          {isDebtor ? 'You owe' : "You're owed"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 text-right">
              <button
                onClick={() => navigate(`/groups/${event?.groupId}/settlements`)}
                className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                Manage Settlements →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* UPI QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl text-center max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Scan to Pay</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Pay {activeUpiUser}: ₹{activeUpiAmount.toFixed(2)}</p>

            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(activeUpiUrl)}`}
              alt="UPI QR Code"
              className="mx-auto border p-2 bg-white rounded-lg"
            />

            <button
              onClick={() => setShowQRModal(false)}
              className="mt-6 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded transition w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Payment Proof Modal */}
      {showProofModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">Submit Payment Proof</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Provide transaction reference details to verify your payment with the lender.</p>

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
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Proof URL / Attachment Link (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. https://imgur.com/your-receipt-image"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Proof Text / Screenshot OCR (Optional)</label>
                <textarea
                  placeholder="Paste SMS/bank/UPI proof text here to auto-detect UPI ref / UTR"
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={analyzeProof}
                  disabled={isAnalyzingProof || (!proofText.trim() && !proofUrl.trim())}
                  className="mt-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded transition"
                >
                  {isAnalyzingProof ? 'Analyzing…' : 'Auto-read Ref'}
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={submitPaymentProof}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded transition w-full"
              >
                Submit & Mark as Paid
              </button>
              <button
                onClick={() => setShowProofModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded transition w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateSubEventModal
        isOpen={showCreateModal || !!editingSubEvent}
        onClose={() => { setShowCreateModal(false); setEditingSubEvent(null); }}
        onSuccess={handleSubEventCreated}
        eventId={eventId!}
        editSubEvent={editingSubEvent}
      />
    </div>
  );
};
