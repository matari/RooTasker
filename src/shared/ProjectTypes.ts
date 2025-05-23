export interface Project {
  id: string;
  name: string;
  description: string;
  directoryPath: string;  // Associated workspace directory
  color: string;          // CSS color value (e.g., hex, rgba)
  createdAt: string;      // ISO date string
  updatedAt: string;      // ISO date string
}

export interface BaseSchedule {
  id: string;
  projectId: string; // New field
  name: string;
  mode: string;
  modeDisplayName?: string;
  taskInstructions: string;
  scheduleKind: "one-time" | "interval" | "cron" | "recurring";
  recurrenceType?: "daily" | "weekly" | "monthly" | "yearly";
  recurrenceDay?: number;
  recurrenceMonth?: number;
  cronExpression?: string;
  timeInterval?: string;
  timeUnit?: string;
  selectedDays?: Record<string, boolean>;
  startDate?: string;
  startHour?: string;
  startMinute?: string;
  expirationDate?: string;
  expirationHour?: string;
  expirationMinute?: string;
  maxExecutions?: number;
  executionCount?: number;
  requireActivity?: boolean;
  active?: boolean;
  taskInteraction?: "wait" | "interrupt" | "skip";
  inactivityDelay?: string;
  createdAt: string;
  updatedAt: string;
  lastExecutionTime?: string;
  lastSkippedTime?: string;
  lastTaskId?: string;
  nextExecutionTime?: string;
}

export interface BaseWatcher {
  id: string;
  projectId: string; // New field
  name: string;
  directoryPath: string;
  fileTypes: string[];
  prompt: string;
  mode: string;
  modeDisplayName?: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredTime?: string;
  lastTaskId?: string;
}