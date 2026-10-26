/** Calendar date, no timezone: 'YYYY-MM-DD'. */
export type ISODate = string;

/** Local wall-clock time of day: 'HH:MM' (24h). */
export type HHMM = string;

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OnceSchedule {
  type: 'once';
  date: ISODate;
}

export interface WeekdaysSchedule {
  type: 'weekdays';
  weekdays: Weekday[];
}

export interface MonthdaysSchedule {
  type: 'monthdays';
  monthdays: number[]; // 1..31
}

export interface IntervalSchedule {
  type: 'interval';
  every: number; // >= 1
  anchor: ISODate;
}

/** Custom loop pattern: `pattern[i]` means "active" on day i of the loop. */
export interface CycleSchedule {
  type: 'cycle';
  length: number; // 1..31, === pattern.length
  pattern: boolean[];
  anchor: ISODate;
}

export type Schedule =
  | OnceSchedule
  | WeekdaysSchedule
  | MonthdaysSchedule
  | IntervalSchedule
  | CycleSchedule;

export type ScheduleType = Schedule['type'];

export type ItemKind = 'habit' | 'todo';
export type CompletionStatus = 'done' | 'skipped';

export interface Item {
  id: string;
  clientId: string;
  kind: ItemKind;
  title: string;
  description: string | null;
  schedule: Schedule;
  reminderTime: HHMM | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Completion {
  itemId: string;
  date: ISODate;
  status: CompletionStatus;
  updatedAt: string;
}

export interface Settings {
  clientId: string;
  ntfyTopic: string;
  ntfyServer: string;
  notificationsEnabled: boolean;
  digestTime: HHMM;
}

/** Fast lookup of completion status by date. */
export type CompletionMap = Readonly<Record<ISODate, CompletionStatus>>;
