export type TaskStatus = 'Not Started' | 'In Progress' | 'Done';
export type OrderStatus = 'Not Ordered' | 'Ordered' | 'Received';
export type DecisionStatus = 'TBD' | 'Decided';
export type PunchStatus = 'Open' | 'Fixed';
export type Zone = 'Primary Bedroom' | 'Primary Hallway' | 'Primary Bathroom';

export type ViewId = 'dashboard' | 'scope' | 'schedule' | 'orders' | 'budget' | 'log' | 'subs' | 'photos' | 'brief';

export type BudgetCategory = 'Labor' | 'Materials' | 'Contingency';

export interface BudgetLineItem {
  category: BudgetCategory;
  trade: string;
  description: string;
  estimateLow: number;
  estimateHigh: number;
  actual: number;
  notes: string;
  _row: number;
}

export interface ScopeItem {
  zone: Zone;
  lineItem: string;
  category: string;
  trade: string;
  status: TaskStatus;
  notes: string;
  estCost: string;
  _row: number;
}

export interface ScheduleWeek {
  week: number;
  label: string;
  dateRange: string;
  tasks: ScheduleTask[];
}

export interface ScheduleTask {
  task: string;
  zone: Zone;
  status: TaskStatus;
  _row?: number;
}

export interface OrderItem {
  item: string;
  leadTime: string;
  orderByDate: string;
  status: OrderStatus;
  vendor: string;
  cost: string;
  notes: string;
  _row: number;
}

export interface Decision {
  decision: string;
  options: string;
  status: DecisionStatus;
  choice: string;
  notes: string;
  _row: number;
}

export interface Measurement {
  zone: Zone;
  location: string;
  dimension: string;
  value: string;
  notes: string;
  _row: number;
}

export interface SubContact {
  trade: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
  _row: number;
}

export interface SubLogEntry {
  date: string;
  trade: string;
  contact: string;
  notes: string;
  followUp: string;
  quoteAmount: string;
  _row: number;
}

export interface DailyLogEntry {
  date: string;
  entry: string;
  _row: number;
}

export interface PunchItem {
  item: string;
  zone: Zone | string;
  status: PunchStatus;
  photo: string;
  notes: string;
  _row: number;
}

export type GTDContext = '@phone' | '@store' | '@computer' | '@home' | '@waiting';
export type ActionPriority = 'urgent' | 'soon' | 'later';

export interface NextAction {
  id: string;
  action: string;
  context: GTDContext;
  priority: ActionPriority;
  source: string; // which view/data this came from
  sourceView: ViewId;
  done: boolean;
}

export interface Photo {
  id: string;
  dataUrl: string;
  zone: Zone | string;
  task: string;
  caption: string;
  timestamp: string;
}
