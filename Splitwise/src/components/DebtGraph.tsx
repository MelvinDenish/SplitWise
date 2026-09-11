import { useMemo, useState } from 'react';
import { ArrowRight, GitMerge, History } from 'lucide-react';

type Edge = {
  user1Id: string | number;
  user1: string;
  user2Id: string | number;
  user2: string;
  amount: number;
};

type Cycle = {
  userIds: (string | number)[];
  cancellableAmount: number;
};

type Settlement = {
  fromUserId: string | number;
  fromUserName: string;
  toUserId: string | number;
  toUserName: string;
  amount: number;
  confirmedAt?: string;
  createdAt?: string;
};

type Props = {
  rawEdges: Edge[];
  optimizedEdges: Edge[];
  cycles?: Cycle[];
  settlements?: Settlement[];
};

type Mode = 'optimized' | 'raw' | 'cycles' | 'history';

const colors = ['#2563eb', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#c2410c', '#4f46e5', '#be123c'];

export const DebtGraph = ({ rawEdges, optimizedEdges, cycles = [], settlements = [] }: Props) => {
  const [mode, setMode] = useState<Mode>('optimized');
  const [historyIndex, setHistoryIndex] = useState(Math.max(0, settlements.length - 1));

  const activeEdges = mode === 'raw'
    ? rawEdges
    : mode === 'history'
      ? settlementEdges(settlements.slice(0, historyIndex + 1))
      : optimizedEdges;

  const nodes = useMemo(() => {
    const byId = new Map<string, string>();
    [...rawEdges, ...optimizedEdges].forEach((edge) => {
      byId.set(String(edge.user1Id), edge.user1);
      byId.set(String(edge.user2Id), edge.user2);
    });
    settlements.forEach((settlement) => {
      byId.set(String(settlement.fromUserId), settlement.fromUserName);
      byId.set(String(settlement.toUserId), settlement.toUserName);
    });
    return Array.from(byId.entries()).map(([id, name], index, all) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, all.length) - Math.PI / 2;
      return {
        id,
        name,
        x: 250 + Math.cos(angle) * 170,
        y: 220 + Math.sin(angle) * 145,
        color: colors[index % colors.length],
      };
    });
  }, [rawEdges, optimizedEdges, settlements]);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden mt-6">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Debt Graph</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Visualize direct debts, optimized payments, cycles, and settlement history.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['optimized', 'raw', 'cycles', 'history'] as Mode[]).map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                mode === item
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
              }`}
            >
              {item === 'optimized' ? 'Simplified' : item === 'raw' ? 'Raw' : item === 'cycles' ? 'Cycles' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'history' && settlements.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
          <input
            type="range"
            min={0}
            max={Math.max(0, settlements.length - 1)}
            value={historyIndex}
            onChange={(e) => setHistoryIndex(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Showing first {historyIndex + 1} confirmed settlement{historyIndex === 0 ? '' : 's'}.
          </p>
        </div>
      )}

      {mode === 'cycles' && cycles.length > 0 && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40">
          <div className="space-y-1.5">
            {cycles.map((cycle, index) => (
              <div key={index} className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <GitMerge className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{cycle.userIds.join(' → ')} cancels ₹{Number(cycle.cancellableAmount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <svg width="520" height="440" viewBox="0 0 520 440" className="mx-auto block">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>
          {activeEdges.map((edge, index) => {
            const from = nodeById.get(String(edge.user1Id));
            const to = nodeById.get(String(edge.user2Id));
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.sqrt(dx * dx + dy * dy) || 1;
            const startX = from.x + (dx / length) * 38;
            const startY = from.y + (dy / length) * 38;
            const endX = to.x - (dx / length) * 38;
            const endY = to.y - (dy / length) * 38;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            return (
              <g key={`${edge.user1Id}-${edge.user2Id}-${index}`}>
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={mode === 'raw' ? '#94a3b8' : '#64748b'}
                  strokeWidth={Math.max(2, Math.min(8, Number(edge.amount) / 100))}
                  markerEnd="url(#arrow)"
                  opacity={0.9}
                />
                <rect x={midX - 30} y={midY - 12} width="60" height="24" rx="6" fill="white" stroke="#e2e8f0" />
                <text x={midX} y={midY + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
                  ₹{Number(edge.amount).toFixed(0)}
                </text>
              </g>
            );
          })}
          {nodes.map((node) => (
            <g key={node.id}>
              <circle cx={node.x} cy={node.y} r="30" fill={node.color} />
              <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="white">
                {node.name.slice(0, 1).toUpperCase()}
              </text>
              <text x={node.x} y={node.y + 48} textAnchor="middle" fontSize="11" fontWeight="700" fill="#475569">
                {node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {activeEdges.length === 0 && (
        <div className="px-6 pb-6 text-center text-sm text-gray-500 dark:text-gray-400">No graph edges to show in this mode.</div>
      )}

      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <ArrowRight className="w-3.5 h-3.5" />
        Arrows point from debtor to creditor.
      </div>
    </div>
  );
};

const settlementEdges = (settlements: Settlement[]): Edge[] => settlements.map((settlement) => ({
  user1Id: settlement.fromUserId,
  user1: settlement.fromUserName,
  user2Id: settlement.toUserId,
  user2: settlement.toUserName,
  amount: Number(settlement.amount),
}));
