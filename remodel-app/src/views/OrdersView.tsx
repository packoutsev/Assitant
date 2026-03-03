import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import type { OrderItem, Decision, OrderStatus, DecisionStatus } from '../types';
import { Package, HelpCircle, Check } from 'lucide-react';

interface OrdersViewProps {
  orders: OrderItem[];
  decisions: Decision[];
  onUpdateOrderStatus: (item: OrderItem, newStatus: OrderStatus) => void;
  onUpdateDecision: (item: Decision, newStatus: DecisionStatus, choice: string) => void;
}

const orderStatusCycle: OrderStatus[] = ['Not Ordered', 'Ordered', 'Received'];

export function OrdersView({ orders, decisions, onUpdateOrderStatus, onUpdateDecision }: OrdersViewProps) {
  const [editingDecision, setEditingDecision] = useState<number | null>(null);
  const [choiceInput, setChoiceInput] = useState('');

  function cycleOrderStatus(item: OrderItem) {
    const idx = orderStatusCycle.indexOf(item.status);
    const next = orderStatusCycle[(idx + 1) % orderStatusCycle.length];
    onUpdateOrderStatus(item, next);
  }

  function startEditDecision(item: Decision) {
    setEditingDecision(item._row);
    setChoiceInput(item.choice);
  }

  function saveDecision(item: Decision) {
    onUpdateDecision(item, 'Decided', choiceInput);
    setEditingDecision(null);
    setChoiceInput('');
  }

  function reopenDecision(item: Decision) {
    onUpdateDecision(item, 'TBD', '');
  }

  const now = new Date();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Orders Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Package size={18} className="text-copper" />
          <h1 className="text-lg font-bold text-slate-dark">Orders</h1>
        </div>

        <div className="space-y-2">
          {orders.map(order => {
            const orderBy = new Date(order.orderByDate);
            const daysLeft = Math.ceil((orderBy.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isUrgent = order.status !== 'Received' && daysLeft <= 7;
            const isOverdue = order.status !== 'Received' && daysLeft <= 0;

            return (
              <div
                key={order._row}
                onClick={() => cycleOrderStatus(order)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  order.status === 'Received'
                    ? 'bg-sage-light/30 border-sage/20 opacity-70'
                    : isOverdue
                    ? 'bg-red-50 border-red-200'
                    : isUrgent
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-warm-dark hover:border-copper/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${order.status === 'Received' ? 'line-through text-gray-400' : 'text-slate-dark'}`}>
                      {order.item}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-light">
                      <span>Lead: {order.leadTime}</span>
                      <span>Order by: {new Date(order.orderByDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      {order.vendor && <span>Vendor: {order.vendor}</span>}
                    </div>
                    {order.notes && <p className="text-[11px] text-slate-light/70 mt-1">{order.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={order.status} small />
                    {order.status !== 'Received' && (
                      <span className={`text-[10px] font-medium ${
                        isOverdue ? 'text-red-700' : isUrgent ? 'text-amber-700' : 'text-slate-light'
                      }`}>
                        {isOverdue ? 'OVERDUE' : `${daysLeft}d`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decisions Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle size={18} className="text-copper" />
          <h2 className="text-lg font-bold text-slate-dark">Decisions</h2>
          <span className="text-[11px] text-slate-light">
            {decisions.filter(d => d.status === 'TBD').length} remaining
          </span>
        </div>

        <div className="space-y-2">
          {decisions.map(decision => (
            <div
              key={decision._row}
              className={`p-3 rounded-lg border transition-all ${
                decision.status === 'Decided'
                  ? 'bg-sage-light/30 border-sage/20'
                  : 'bg-white border-warm-dark'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-dark">{decision.decision}</p>
                  <p className="text-[11px] text-slate-light mt-0.5">{decision.options}</p>
                  {decision.notes && <p className="text-[11px] text-slate-light/70 mt-0.5">{decision.notes}</p>}
                  {decision.status === 'Decided' && decision.choice && (
                    <p className="text-sm text-sage font-medium mt-1 flex items-center gap-1">
                      <Check size={14} /> {decision.choice}
                    </p>
                  )}
                </div>
                <StatusBadge status={decision.status} small />
              </div>

              {editingDecision === decision._row ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={choiceInput}
                    onChange={e => setChoiceInput(e.target.value)}
                    placeholder="Enter your decision..."
                    className="flex-1 text-sm border border-warm-dark rounded-lg px-3 py-1.5 focus:outline-none focus:border-copper"
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                  <button
                    onClick={() => saveDecision(decision)}
                    className="text-sm bg-copper text-white px-3 py-1.5 rounded-lg hover:bg-copper-dark"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  {decision.status === 'TBD' ? (
                    <button
                      onClick={() => startEditDecision(decision)}
                      className="text-xs text-copper hover:underline"
                    >
                      Make decision
                    </button>
                  ) : (
                    <button
                      onClick={() => reopenDecision(decision)}
                      className="text-xs text-slate-light hover:underline"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
