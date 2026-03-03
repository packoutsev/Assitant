export type TaskStatus = 'Not Started' | 'In Progress' | 'Done' | 'Blocked';

export interface DailyTask {
  Day: string;
  Phase: string;
  Task: string;
  Category: string;
  Owner: string;
  Status: TaskStatus;
  Notes: string;
  _row: number; // 1-based row in the sheet (for writes)
}

export interface ToolAccess {
  Tool: string;
  Purpose: string;
  'Access Level': string;
  'Setup Owner': string;
  Status: string;
  'Login/URL': string;
  Notes: string;
  _row: number;
}

export interface KPIRow {
  Metric: string;
  'Week 1 Target': string;
  'Week 1 Actual': string;
  'Week 2 Target': string;
  'Week 2 Actual': string;
  'Week 3 Target': string;
  'Week 3 Actual': string;
  'Week 4 Target': string;
  'Week 4 Actual': string;
  Notes: string;
  _row: number;
  _section?: string;
}

export interface TrainingModule {
  Module: string;
  Source: string;
  Category: string;
  'Due By': string;
  Completed: string;
  'Score / Notes': string;
  _row: number;
}

export interface QuickRefEntry {
  key: string;
  value: string;
  _section: string;
}

export interface SheetData {
  dailyPlan: DailyTask[];
  toolAccess: ToolAccess[];
  kpiRamp: KPIRow[];
  trainingLog: TrainingModule[];
  quickRef: QuickRefEntry[];
  loading: boolean;
  error: string | null;
}
