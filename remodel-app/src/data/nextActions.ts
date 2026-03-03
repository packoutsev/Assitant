import type { NextAction, OrderItem, Decision, Measurement, SubContact, ScopeItem, ActionPriority } from '../types';
import { schedule } from './schedule';

interface ProjectState {
  orders: OrderItem[];
  decisions: Decision[];
  measurements: Measurement[];
  subs: SubContact[];
  scope: ScopeItem[];
}

/** Map of decisions that block specific orders */
const decisionBlocksOrder: Record<string, string[]> = {
  'Paint color': ['Paint'],
  'Large format field tile selection': ['Large format field tile'],
  'Hallway light fixture style': ['Light fixtures'],
  'Bathroom light fixture style': ['Light fixtures'],
  'Smart thermostat brand': ['Smart thermostat'],
  'Glass shower door style': ['Glass shower door'],
  'Exhaust fan model': ['Exhaust fan'],
  'Sink faucet style/finish': ['Sink trim/hardware'],
};

/** Trades needed by schedule week (0-indexed) */
const tradesNeededByWeek: Record<number, string[]> = {
  0: ['Glass / Shower Door', 'Tile Installer'],
  1: ['Tile Installer'],
  2: [],
  3: ['Tile Installer'],
  4: [],
  5: ['Glass / Shower Door'],
  6: [],
};

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getCurrentWeekIdx(): number {
  const now = new Date();
  const weekStarts = [
    new Date('2026-03-03'), new Date('2026-03-10'), new Date('2026-03-17'),
    new Date('2026-03-24'), new Date('2026-03-31'), new Date('2026-04-07'),
    new Date('2026-04-14'), new Date('2026-04-21'),
  ];
  for (let i = weekStarts.length - 1; i >= 0; i--) {
    if (now >= weekStarts[i]) return i;
  }
  return -1;
}

function priority(daysLeft: number): ActionPriority {
  if (daysLeft <= 3) return 'urgent';
  if (daysLeft <= 10) return 'soon';
  return 'later';
}

export function deriveNextActions(state: ProjectState): NextAction[] {
  const actions: NextAction[] = [];
  const now = new Date();
  const currentWeek = getCurrentWeekIdx();

  // 1. DECISIONS that need to be made (especially those blocking orders)
  state.decisions.forEach(d => {
    if (d.status !== 'TBD') return;

    // Check if this decision blocks an order
    const blockedOrderNames = decisionBlocksOrder[d.decision] || [];
    const blockedOrders = state.orders.filter(o =>
      o.status === 'Not Ordered' && blockedOrderNames.some(name => o.item.includes(name))
    );

    if (blockedOrders.length > 0) {
      const earliestOrderBy = blockedOrders.reduce((earliest, o) => {
        const d = daysUntil(o.orderByDate);
        return d < earliest ? d : earliest;
      }, 999);

      actions.push({
        id: `decision-${d._row}`,
        action: `Decide: ${d.decision} (${d.options})`,
        context: '@home',
        priority: priority(earliestOrderBy),
        source: `Blocks ordering: ${blockedOrders.map(o => o.item.split('(')[0].trim()).join(', ')}`,
        sourceView: 'orders',
        done: false,
      });
    } else {
      actions.push({
        id: `decision-${d._row}`,
        action: `Decide: ${d.decision}`,
        context: '@home',
        priority: 'later',
        source: d.options,
        sourceView: 'orders',
        done: false,
      });
    }
  });

  // 2. ORDERS that need to be placed
  state.orders.forEach(o => {
    if (o.status === 'Received') return;

    const days = daysUntil(o.orderByDate);

    if (o.status === 'Not Ordered') {
      // Check if a decision blocks this order
      const blockingDecision = state.decisions.find(d =>
        d.status === 'TBD' && (decisionBlocksOrder[d.decision] || []).some(name => o.item.includes(name))
      );

      if (blockingDecision) {
        // Skip — the decision action already covers this
        return;
      }

      // Determine context: vendor set = @computer (order online), no vendor = @phone or @store
      const isLocalPickup = o.leadTime === 'In stock' || o.notes.toLowerCase().includes('locally');
      const context = isLocalPickup ? '@store' : o.vendor ? '@computer' : '@phone';

      actions.push({
        id: `order-${o._row}`,
        action: isLocalPickup
          ? `Go buy: ${o.item.split('(')[0].trim()}`
          : `Order: ${o.item.split('(')[0].trim()}`,
        context,
        priority: priority(days),
        source: `Order by ${new Date(o.orderByDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${o.leadTime} lead time`,
        sourceView: 'orders',
        done: false,
      });
    } else if (o.status === 'Ordered') {
      actions.push({
        id: `order-wait-${o._row}`,
        action: `Waiting: ${o.item.split('(')[0].trim()}`,
        context: '@waiting',
        priority: 'later',
        source: `Ordered — ${o.leadTime} lead time`,
        sourceView: 'orders',
        done: false,
      });
    }
  });

  // 3. SUBS that need to be found/contacted
  const weekToCheck = currentWeek < 0 ? 0 : currentWeek;
  const upcomingTrades = new Set<string>();
  for (let w = weekToCheck; w <= Math.min(weekToCheck + 2, 7); w++) {
    (tradesNeededByWeek[w] || []).forEach(t => upcomingTrades.add(t));
  }

  state.subs.forEach(s => {
    if (!upcomingTrades.has(s.trade)) return;
    if (s.name && s.phone) return; // Already have contact

    actions.push({
      id: `sub-${s._row}`,
      action: `Find a ${s.trade}${s.notes ? ` — ${s.notes}` : ''}`,
      context: '@phone',
      priority: currentWeek < 0 ? 'soon' : 'urgent',
      source: `Needed within next 2 weeks`,
      sourceView: 'subs',
      done: false,
    });
  });

  // 4. MEASUREMENTS that are empty and needed
  const criticalMeasurements = state.measurements.filter(m => !m.value || m.value === '');
  criticalMeasurements.forEach(m => {
    // Closet measurement is needed for IKEA order
    // Shower dimensions are needed for framing/pan
    const isBlocking = m.location.includes('Closet') || m.location.includes('Shower') || m.dimension.includes('Rough opening');
    if (!isBlocking && currentWeek > 1) return; // Only show non-critical measurements early on

    actions.push({
      id: `measure-${m._row}`,
      action: `Measure: ${m.location} — ${m.dimension}`,
      context: '@home',
      priority: isBlocking ? 'soon' : 'later',
      source: `${m.zone.replace('Primary ', '')}${m.notes ? ` — ${m.notes}` : ''}`,
      sourceView: 'photos',
      done: false,
    });
  });

  // 5. SCHEDULE tasks for current week that are "Not Started"
  if (currentWeek >= 0 && currentWeek < schedule.length) {
    schedule[currentWeek].tasks.forEach((task, i) => {
      if (task.status === 'Done') return;

      // Don't duplicate items already covered by orders/decisions/subs
      const isDuplicate = actions.some(a =>
        a.action.toLowerCase().includes(task.task.toLowerCase().split(' ').slice(0, 3).join(' '))
      );
      if (isDuplicate) return;

      actions.push({
        id: `schedule-${currentWeek}-${i}`,
        action: task.task,
        context: '@home',
        priority: 'soon',
        source: `${schedule[currentWeek].label} — ${task.zone.replace('Primary ', '')}`,
        sourceView: 'schedule',
        done: false,
      });
    });
  }

  // Sort: urgent first, then soon, then later
  const priorityOrder: Record<ActionPriority, number> = { urgent: 0, soon: 1, later: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return actions;
}
