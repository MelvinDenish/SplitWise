import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Users, Calendar, Plus, ChevronLeft, ChevronRight, QrCode, Search, Download, LogOut, TrendingDown, ArrowRight, CheckCircle2, BarChart3, ShieldCheck } from 'lucide-react';
import { analyticsAPI, groupAPI, eventAPI } from '../lib/api';
import { Group, Event, User } from '../types';
import { useToast } from '../components/Toast';
import { CreateEventModal } from '../components/CreateEventModal';
import { useAuth } from '../contexts/AuthContext';
import { BudgetAlertBanner } from '../components/BudgetAlertBanner';

export const GroupDetail = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [weeklySpent, setWeeklySpent] = useState<number>(0);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getStartOfWeek(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [members, setMembers] = useState<User[]>([]);
  const [groupSettlements, setGroupSettlements] = useState<any[]>([]);
  const [rawGroupSettlements, setRawGroupSettlements] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [showRawBreakdown, setShowRawBreakdown] = useState(false);

  // Search & Invite states
  const [searchText, setSearchText] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const { showToast, ToastContainer } = useToast();

  function getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  const fetchGroupData = async () => {
    if (!groupId) return;

    try {
      // These three are all independent of each other -- fetch in parallel instead of
      // chaining sequentially (each round trip carries real network latency).
      const [groupResult, pairwiseResult, analyticsResult] = await Promise.all([
        groupAPI.getById(groupId),
        groupAPI.getGroupPairwise(groupId).catch(() => ({ data: {} as any })),
        analyticsAPI.group(groupId).catch(() => ({ data: null as any })),
        fetchEvents(),
      ]);

      const groupData = groupResult.data;
      setGroup(groupData);
      // GroupResponse now embeds full member profiles, so there's no need for a separate
      // GET /users call (which fetched every user in the system) just to resolve names.
      setMembers(groupData.members || []);

      // Backend returns { groupId, pairwiseBalances: [...], rawPairwiseBalances: [...] }
      // with user1Id/user1/user2Id/user2/amount. rawPairwiseBalances is the pre-simplification
      // breakdown -- what circular/indirect debts a simplified edge actually collapsed.
      setGroupSettlements(pairwiseResult.data?.pairwiseBalances || []);
      setRawGroupSettlements(pairwiseResult.data?.rawPairwiseBalances || []);
      setAnalytics(analyticsResult.data);
    } catch (error) {
      showToast('Failed to load group', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExitGroup = async () => {
    if (!groupId || !user) return;
    if (!window.confirm('Are you sure you want to exit this group?')) return;
    try {
      await groupAPI.leaveGroup(groupId, user.id);
      showToast('Successfully exited group!', 'success');
      navigate('/dashboard');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to exit group. Verify if you have non-zero balance.', 'error');
    }
  };


  const fetchEvents = async () => {
    if (!groupId) return;
    try {
      // Backend returns all events for the group; we filter client-side by week
      const response = await eventAPI.getByGroup(groupId);
      const all: Event[] = response.data;
      setAllEvents(all);
      filterEventsByWeek(all, currentWeekStart);
    } catch (error) {
      showToast('Failed to load events', 'error');
    }
  };

  const filterEventsByWeek = async (all: Event[], weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const startStr = fmt(weekStart);
    const endStr = fmt(weekEnd);

    const inWeek = all.filter(e => {
      const s = e.eventDate ? e.eventDate.slice(0, 10) : '';
      return s >= startStr && s <= endStr;
    });
    setEvents(inWeek);

    // Each event already carries its own totalAmount (server-computed) -- no need to
    // re-fetch every expense + share in the week just to sum it client-side.
    setWeeklySpent(inWeek.reduce((s, e) => s + (Number(e.totalAmount) || 0), 0));
  };

  useEffect(() => {
    fetchGroupData();
  }, [groupId]);

  // Settlement balances change from other pages/tabs (e.g. confirming a payment on the
  // Manage Settlements page) -- refetch when the user comes back to this tab/page instead
  // of leaving the Settlement Center widget showing whatever was true at the last mount.
  useEffect(() => {
    const onFocus = () => fetchGroupData();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchGroupData(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (group) {
      filterEventsByWeek(allEvents, currentWeekStart);
    }
  }, [currentWeekStart]);

  const nextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const prevWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };

  const formatDateRange = () => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    return `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const handleEventCreated = () => {
    setShowCreateModal(false);
    fetchEvents();
  };

  const handleExportCSV = () => {
    const headers = ["Event Title", "Event Date", "Total Amount (INR)"];
    const rows = events.map(e => [
      e.name || e.title || "Unnamed Event",
      new Date(e.eventDate).toLocaleDateString(),
      (e.totalAmount || 0).toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${group?.name || 'group'}_expenses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Expenses exported successfully!', 'success');
  };

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

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-gray-600 dark:text-gray-400">Group not found</p>
        </div>
      </div>
    );
  }

  const handleEditBudget = async () => {
    if (!group || !groupId) return;
    const current = group.budgetLimit;
    const input = window.prompt('Set group budget limit (₹). Leave blank to remove.', current ? String(current) : '');
    if (input === null) return; // cancelled
    const trimmed = input.trim();
    const budgetLimit = trimmed === '' ? null : Number(trimmed);
    if (budgetLimit !== null && (isNaN(budgetLimit) || budgetLimit < 0)) {
      showToast('Enter a valid non-negative number', 'error');
      return;
    }
    try {
      await groupAPI.update(groupId, { name: group.name, budgetLimit });
      showToast('Budget updated', 'success');
      fetchGroupData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update budget', 'error');
    }
  };

  // weeklySpent is loaded from state (computed from real subevent totals)
  const budgetLimit = group?.budgetLimit || 0;

  const filteredEvents = events.filter(e => {
    const label = e.name || e.title || '';
    return label.toLowerCase().includes(searchText.toLowerCase());
  });

  const inviteLink = `${window.location.origin}/groups/join/${group.groupCode}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Navbar />
      <ToastContainer />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Group Header */}
        <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{group.name}</h1>
            <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <Users className="w-5 h-5" />
                <span>{(group.memberIds?.length || group.members?.length || 0)} members</span>
              </div>
              {group.groupCode && (
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono">
                  Code: {group.groupCode}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            {group && user && String(group.creatorId) !== String(user.id) && (
              <button
                onClick={handleExitGroup}
                className="flex items-center gap-2 bg-red-50 border border-red-200 hover:bg-red-100 text-red-650 px-4 py-2 rounded-lg text-sm font-medium transition dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <LogOut className="w-4 h-4" />
                Exit Group
              </button>
            )}
            {group && user && String(group.creatorId) === String(user.id) && (
              <button
                onClick={handleEditBudget}
                className="flex items-center gap-2 bg-white border border-gray-300 dark:border-gray-650 hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                💰 Edit Budget
              </button>
            )}
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 bg-white border border-gray-300 dark:border-gray-650 hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <QrCode className="w-4 h-4" />
              Invite Link / QR
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-white border border-gray-300 dark:border-gray-650 hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Budget Alert Banner */}
        <BudgetAlertBanner
          spent={weeklySpent}
          limit={Number(budgetLimit)}
          groupName={group.name}
        />

        {analytics && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md mb-6 overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Predictive Expense Assistant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Forecasts, category trends, unusual spends, and recurring suggestions.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-6">
              <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total spend</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">₹{Number(analytics.totalSpend || 0).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Monthly average</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">₹{Number(analytics.monthlyAverage || 0).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Next month forecast</p>
                <p className="text-xl font-bold text-primary-600 dark:text-primary-400">₹{Number(analytics.forecastNextMonth || 0).toFixed(2)}</p>
              </div>
            </div>
            <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Categories</p>
                <div className="space-y-2">
                  {(analytics.categorySpends || []).slice(0, 5).map((cat: any) => (
                    <div key={cat.category} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                      <span className="text-gray-700 dark:text-gray-200">{cat.category} · {cat.expenseCount} expense{cat.expenseCount === 1 ? '' : 's'}</span>
                      <span className="font-bold text-gray-900 dark:text-white">₹{Number(cat.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Insights</p>
                {(analytics.insights || []).length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-3">Not enough history for predictions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.insights.map((insight: any, index: number) => (
                      <div key={index} className="text-sm bg-primary-50 dark:bg-primary-950/20 text-primary-800 dark:text-primary-200 rounded-lg px-3 py-2 border border-primary-100 dark:border-primary-900/40">
                        <p className="font-semibold">{insight.title}</p>
                        <p className="text-xs mt-0.5">{insight.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Members Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Members</h2>
          <div className="flex flex-wrap gap-2">
            {members.length > 0 ? members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full"
              >
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">
                    {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                  </span>
                </div>
                <span className="text-sm text-gray-900 dark:text-white">{member.name}</span>
              </div>
            )) : (group.memberIds || []).map((memberId) => (
              <div
                key={memberId}
                className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full"
              >
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">?</span>
                </div>
                <span className="text-sm text-gray-900 dark:text-white">Member #{memberId}</span>
              </div>
            ))}
          </div>
        </div>

        {analytics?.trustScores?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md mb-6 overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Trust & Reputation</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">On-time payment score, pending debts, confirmation waits, and reliability badges.</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {analytics.trustScores.map((score: any) => (
                <div key={score.userId} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{score.userName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{score.badge}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
                      {Math.round(Number(score.onTimeRate) * 100)}% on-time
                    </span>
                    <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {score.pendingDebts} pending
                    </span>
                    <span className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                      {score.pendingConfirmations} awaiting confirmation
                    </span>
                    <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {Number(score.averageSettlementDelayDays).toFixed(1)}d avg delay
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== Settlement Center ===== */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md mb-6 overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-950/30 dark:to-indigo-950/20">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Settlement Center</h2>
              {groupSettlements.length > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs rounded-full font-semibold">
                  {groupSettlements.length} pending
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                Net balances · Circular debts resolved
              </p>
              {rawGroupSettlements.length > 0 && (
                <button
                  onClick={() => setShowRawBreakdown(v => !v)}
                  className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {showRawBreakdown ? 'Hide' : 'Show'} direct debts ({rawGroupSettlements.length})
                </button>
              )}
            </div>
          </div>

          {showRawBreakdown && rawGroupSettlements.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                These are the actual direct debts before simplification
                {rawGroupSettlements.length > groupSettlements.length
                  ? ` — collapsed from ${rawGroupSettlements.length} direct debts into ${groupSettlements.length} payment${groupSettlements.length === 1 ? '' : 's'} above (circular/indirect debt resolved).`
                  : '.'}
              </p>
              <div className="space-y-1.5">
                {rawGroupSettlements.map((item: any, idx: number) => (
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

          {groupSettlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
              <p className="font-semibold text-gray-700 dark:text-gray-200">All settled up! 🎉</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No outstanding balances in this group.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {groupSettlements.map((item: any, idx: number) => {
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
                        {item.description && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 italic font-medium leading-relaxed bg-gray-50 dark:bg-gray-800/40 p-2 rounded-lg border border-gray-100/50 dark:border-gray-700/30">
                            💡 {item.description}
                          </p>
                        )}
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
          )}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 text-right">
            <button
              onClick={() => navigate(`/groups/${groupId}/settlements`)}
              className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              Manage Settlements →
            </button>
          </div>
        </div>


        {/* Filters and Action Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* Week navigation */}
            <div className="flex items-center justify-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-1 bg-white dark:bg-gray-800">
              <button
                onClick={prevWeek}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-750 transition"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-250">
                  {formatDateRange()}
                </span>
              </div>
              <button
                onClick={nextWeek}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-755 transition"
              >
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-60"
              />
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium w-full md:w-auto"
          >
            <Plus className="w-4 h-4" />
            Create Event
          </button>
        </div>

        {/* Events Grid */}
        {filteredEvents.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No events found
            </h3>
            <p className="text-gray-650 dark:text-gray-400 mb-4">
              Try a different search or create a new event for this week
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => navigate(`/events/${event.id}`)}
                className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary-500 hover:bg-primary-50/5 dark:hover:bg-primary-950/10"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 truncate">
                  {event.name || event.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {new Date(event.eventDate).toLocaleDateString()}
                </p>
                <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
                  ₹{(event.totalAmount || 0).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Links Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 text-center">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">Group Invitation</h3>
            <p className="text-xs text-gray-500 mb-4">Let friends scan this QR code or use the link to request joining this group.</p>
            
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteLink)}`} 
              alt="Group Invite Link QR Code" 
              className="mx-auto border p-2 bg-white rounded-lg mb-4"
            />
            
            <div className="bg-gray-55 bg-gray-50 dark:bg-gray-700 p-2.5 rounded text-xs font-mono text-gray-900 dark:text-gray-200 break-all select-all border dark:border-gray-600">
              {inviteLink}
            </div>
            
            <button 
              onClick={() => {
                navigator.clipboard.writeText(inviteLink);
                showToast('Invite link copied to clipboard!', 'success');
              }}
              className="mt-3 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-semibold w-full transition"
            >
              Copy Link
            </button>
            
            <button 
              onClick={() => setShowInviteModal(false)}
              className="mt-2 px-4 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded w-full transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleEventCreated}
        groupId={groupId!}
      />
    </div>
  );
};
