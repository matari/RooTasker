import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import * as parser from 'cron-parser';
import { getWorkspacePath } from '../../utils/path';
import { fileExistsAtPath } from '../../utils/fs';
import { RooService } from './RooService';
import type { BaseSchedule } from '../../shared/ProjectTypes'; // Added import

export interface Schedule { // Added export
	id: string;
  name: string;
  mode: string;
  modeDisplayName?: string;
  taskInstructions: string;
  scheduleKind: "one-time" | "interval" | "cron" | "recurring";
  recurrenceType?: "daily" | "weekly" | "monthly" | "yearly";
  recurrenceDay?: number; // Day of month for monthly and yearly recurrence
  recurrenceMonth?: number; // Month for yearly recurrence
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
  maxExecutions?: number; // Maximum number of executions
  executionCount?: number; // Current count of executions
  requireActivity?: boolean;
  active?: boolean; // If undefined, treat as true (backward compatibility)
  taskInteraction?: "wait" | "interrupt" | "skip"; // How to handle when a task is already running
  inactivityDelay?: string; // Number of minutes of inactivity to wait before executing when taskInteraction is "wait"
  createdAt: string;
  updatedAt: string;
  lastExecutionTime?: string;
  lastSkippedTime?: string; // Timestamp when execution was last skipped
  lastTaskId?: string; // Roo Cline task ID of the last execution
  nextExecutionTime?: string; // ISO string of the next calculated execution time
}

interface SchedulesFile {
  schedules: Schedule[];
}

export class SchedulerService {
  private static instance: SchedulerService;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private schedules: Schedule[] = [];
  private schedulesFilePath: string;
  private outputChannel: vscode.OutputChannel;

  private constructor(context: vscode.ExtensionContext) {
    this.schedulesFilePath = path.join(getWorkspacePath(), '.rootasker', 'schedules.json');
    this.outputChannel = vscode.window.createOutputChannel('RooTasker Scheduler');
    context.subscriptions.push(this.outputChannel);
  }

  public static getInstance(context: vscode.ExtensionContext): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService(context);
    }
    return SchedulerService.instance;
  }

  public async toggleScheduleActive(scheduleId: string, active: boolean): Promise<void> {
    const scheduleIndex = this.schedules.findIndex(s => s.id === scheduleId);
    if (scheduleIndex === -1) {
      this.log(`Schedule with ID ${scheduleId} not found.`);
      return;
    }
    const schedule = this.schedules[scheduleIndex];
    if (schedule.active === active) {
      this.log(`Schedule "${schedule.name}" is already ${active ? 'active' : 'inactive'}.`);
      return;
    }
    const updatedSchedule = await this.updateSchedule(scheduleId, { active });
    if (active && updatedSchedule) {
      this.setupTimerForSchedule(updatedSchedule);
      this.log(`Activated schedule "${schedule.name}" and scheduled next task.`);
    } else {
      const timer = this.timers.get(scheduleId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(scheduleId);
        this.log(`Deactivated schedule "${schedule.name}" and cleared timer.`);
      }
    }
  }

  public async updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<Schedule | undefined> {
    const scheduleIndex = this.schedules.findIndex(s => s.id === scheduleId);
    if (scheduleIndex === -1) return undefined;
    const updatedSchedule = { ...this.schedules[scheduleIndex], ...updates, updatedAt: new Date().toISOString() };
    this.schedules[scheduleIndex] = updatedSchedule;
    await this.saveSchedules();
    try {
      await vscode.commands.executeCommand('rootasker.schedulesUpdated');
    } catch (error) {
      this.log(`Error notifying webview of schedule update: ${error instanceof Error ? error.message : String(error)}`);
    }
    return updatedSchedule;
  }

  public async initialize(): Promise<void> {
     console.log('Initializing scheduler service!');
     await this.loadSchedules();
     this.setupTimers();
   }

  private async loadSchedules(): Promise<void> {
    try {
      const exists = await fileExistsAtPath(this.schedulesFilePath);
      if (!exists) {
        const dirPath = path.dirname(this.schedulesFilePath);
        try {
            await fs.mkdir(dirPath, { recursive: true });
            this.log(`Created directory ${dirPath}`);
        } catch (mkdirError) {
            this.log(`Error creating directory ${dirPath}: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`);
            // Proceed with empty schedules if directory creation fails, or handle error as appropriate
        }
        this.log(`Schedules file not found at ${this.schedulesFilePath}, creating an empty one.`);
        this.schedules = [];
        await this.saveSchedules(); // Save an empty schedules file
        return;
      }

      const content = await fs.readFile(this.schedulesFilePath, 'utf-8');
      const data = JSON.parse(content) as SchedulesFile;
      this.schedules = data.schedules || [];
      this.log(`Loaded ${this.schedules.length} schedules from ${this.schedulesFilePath}`);
    } catch (error) {
      this.log(`Error loading schedules: ${error instanceof Error ? error.message : String(error)}`);
      this.schedules = [];
    }
  }

  private async saveSchedules(): Promise<void> {
    try {
      const dirPath = path.dirname(this.schedulesFilePath);
      if (!await fileExistsAtPath(dirPath)) {
          await fs.mkdir(dirPath, { recursive: true });
      }
      const content = JSON.stringify({ schedules: this.schedules }, null, 2);
      await fs.writeFile(this.schedulesFilePath, content, 'utf-8');
      this.log('Schedules saved successfully');
    } catch (error) {
      this.log(`Error saving schedules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setupTimers(): void {
    console.log('setup timers');
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const schedule of this.schedules) {
      if (schedule.active !== false) { // Treat undefined as active for backward compatibility
        this.setupTimerForSchedule(schedule);
      } else {
        this.log(`Skipping timer setup for inactive schedule "${schedule.name}"`);
      }
    }
  }

  private setupTimerForSchedule(schedule: Schedule): void {
    if (schedule.active === false) { // If explicitly set to false
      this.log(`Not setting up timer for inactive schedule "${schedule.name}"`);
      return;
    }
    
    const nextExecutionTime = this.calculateNextExecutionTime(schedule);

    if (!nextExecutionTime) {
      this.log(`No valid next execution time for schedule "${schedule.name}".`);
      if (schedule.scheduleKind === 'one-time' && (schedule.active ?? true)) {
         // If it was a one-time task and couldn't get a future time (likely already passed and executed or misconfigured)
        this.updateSchedule(schedule.id, { active: false, nextExecutionTime: undefined });
      } else if (schedule.scheduleKind !== 'one-time') {
         // For recurring tasks, if no next time, just clear it. It might be due to expiration or invalid config.
        this.updateSchedule(schedule.id, { nextExecutionTime: undefined });
      }
      return;
    }

    let expirationDateTime;
    if (schedule.expirationDate && schedule.expirationHour && schedule.expirationMinute) {
      expirationDateTime = new Date(
        `${schedule.expirationDate}T${schedule.expirationHour}:${schedule.expirationMinute}:00`
      );
    }

    if (expirationDateTime && nextExecutionTime > expirationDateTime) {
      this.log(`Schedule "${schedule.name}" next execution at ${nextExecutionTime.toISOString()} is after expiration at ${expirationDateTime.toISOString()}. Marking inactive.`);
      this.updateSchedule(schedule.id, { active: false, nextExecutionTime: undefined });
      return;
    }
    
    const nextExecutionTimeStr = nextExecutionTime.toISOString();
    if (schedule.nextExecutionTime !== nextExecutionTimeStr) {
      this.updateSchedule(schedule.id, { nextExecutionTime: nextExecutionTimeStr });
    }

    const delay = nextExecutionTime.getTime() - Date.now();

    if (delay <= 0) {
      this.log(`Schedule "${schedule.name}" is due now or has passed (delay: ${delay}ms).`);
      this.executeSchedule(schedule);
      return;
    }

    this.log(`Setting up timer for schedule "${schedule.name}" to execute in ${Math.floor(delay / 1000 / 60)} minutes at ${nextExecutionTime.toLocaleString()}`);
    const timer = setTimeout(() => {
      this.executeSchedule(schedule);
    }, delay);
    this.timers.set(schedule.id, timer);
  }
    
  private calculateNextExecutionTime(schedule: Schedule): Date | null {
    const now = new Date();

    if (schedule.scheduleKind === 'one-time') {
      if (!schedule.startDate || !schedule.startHour || !schedule.startMinute) {
        this.log(`Schedule "${schedule.name}" (one-time) is missing date/time components.`);
        return null;
      }
      const oneTimeExecution = new Date(`${schedule.startDate}T${schedule.startHour}:${schedule.startMinute}:00`);
      if (schedule.lastExecutionTime) {
        const lastExec = new Date(schedule.lastExecutionTime);
        if (lastExec.getTime() >= oneTimeExecution.getTime()) {
          this.log(`One-time schedule "${schedule.name}" already executed at ${lastExec.toISOString()}.`);
          return null;
        }
      }
      // Return the execution time; setupTimerForSchedule will handle if it's past or future.
      // If it's past and not executed, it's due. If future, it will be scheduled.
      return oneTimeExecution;
    } else if (schedule.scheduleKind === 'recurring') {
      if (!schedule.recurrenceType || !schedule.startHour || !schedule.startMinute) {
        this.log(`Schedule "${schedule.name}" (recurring) is missing required components.`);
        return null;
      }

      // Check for max executions if set
      if (schedule.maxExecutions && schedule.executionCount !== undefined && 
          schedule.executionCount >= schedule.maxExecutions) {
        this.log(`Schedule "${schedule.name}" has reached maximum executions (${schedule.maxExecutions}). Marking inactive.`);
        this.updateSchedule(schedule.id, { active: false, nextExecutionTime: undefined });
        return null;
      }

      let referenceDate: Date;
      if (schedule.lastExecutionTime) {
        // Start from last execution date
        referenceDate = new Date(schedule.lastExecutionTime);
      } else {
        // Start from now if no last execution
        referenceDate = new Date();
      }

      // Set time component based on schedule settings
      const targetHour = parseInt(schedule.startHour);
      const targetMinute = parseInt(schedule.startMinute);

      let nextDate = new Date(referenceDate.getTime());
      
      // Handle different recurrence types
      switch (schedule.recurrenceType) {
        case 'daily':
          // If last execution was today and with same or later time, move to tomorrow
          if (schedule.lastExecutionTime) {
            const lastExec = new Date(schedule.lastExecutionTime);
            const lastExecDay = lastExec.getDate();
            const lastExecMonth = lastExec.getMonth();
            const lastExecYear = lastExec.getFullYear();
            const todayDay = now.getDate();
            const todayMonth = now.getMonth();
            const todayYear = now.getFullYear();
            
            if (lastExecDay === todayDay && lastExecMonth === todayMonth && lastExecYear === todayYear) {
              // Last execution was today, schedule for tomorrow
              nextDate.setDate(nextDate.getDate() + 1);
            } else if (
              // Time has already passed today
              now.getHours() > targetHour || 
              (now.getHours() === targetHour && now.getMinutes() >= targetMinute)
            ) {
              // Time already passed today, schedule for tomorrow
              nextDate = new Date(); // Reset to now
              nextDate.setDate(nextDate.getDate() + 1);
            } else {
              // Time hasn't passed today, schedule for today
              nextDate = new Date(); // Reset to now
            }
          } else {
            // No previous execution
            // If specified time today has passed, schedule for tomorrow
            if (now.getHours() > targetHour || 
                (now.getHours() === targetHour && now.getMinutes() >= targetMinute)) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
          }
          break;

        case 'weekly':
          if (!schedule.selectedDays || !Object.values(schedule.selectedDays).some(Boolean)) {
            this.log(`Weekly schedule "${schedule.name}" has no days selected.`);
            return null;
          }

          const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
          
          // If we have a last execution, start from the day after
          if (schedule.lastExecutionTime) {
            const lastExec = new Date(schedule.lastExecutionTime);
            nextDate = new Date(lastExec.getTime());
            nextDate.setDate(nextDate.getDate() + 1); // Start checking from the next day
          }

          // Find the next valid day
          let found = false;
          let attempts = 0;
          const maxAttempts = 8; // Check for a full week plus one day to handle edge cases
          
          while (!found && attempts < maxAttempts) {
            const dayOfWeek = nextDate.getDay();
            const dayKey = Object.keys(dayMap).find(key => dayMap[key] === dayOfWeek);
            
            if (dayKey && schedule.selectedDays[dayKey]) {
              // This is a selected day
              
              // If this is today, check if the time has already passed
              if (nextDate.getDate() === now.getDate() && 
                  nextDate.getMonth() === now.getMonth() && 
                  nextDate.getFullYear() === now.getFullYear()) {
                
                if (now.getHours() > targetHour || 
                    (now.getHours() === targetHour && now.getMinutes() >= targetMinute)) {
                  // Time already passed today, check the next day
                  nextDate.setDate(nextDate.getDate() + 1);
                  attempts++;
                  continue;
                }
              }
              
              found = true;
            } else {
              // Not a selected day, move to the next
              nextDate.setDate(nextDate.getDate() + 1);
            }
            
            attempts++;
          }
          
          if (!found) {
            this.log(`Could not find next valid weekday for weekly schedule "${schedule.name}".`);
            return null;
          }
          break;

        case 'monthly':
          if (!schedule.recurrenceDay || schedule.recurrenceDay < 1 || schedule.recurrenceDay > 31) {
            this.log(`Monthly schedule "${schedule.name}" has invalid day of month: ${schedule.recurrenceDay}.`);
            return null;
          }
          
          // Set to the target day of this month
          nextDate = new Date();
          nextDate.setDate(schedule.recurrenceDay);
          
          // If that day/time has already passed this month, move to next month
          if (nextDate < now || 
             (nextDate.getDate() === now.getDate() && 
              (now.getHours() > targetHour || 
               (now.getHours() === targetHour && now.getMinutes() >= targetMinute)))) {
            
            nextDate.setMonth(nextDate.getMonth() + 1);
          }
          
          // If last execution was this month on the target day, move to next month
          if (schedule.lastExecutionTime) {
            const lastExec = new Date(schedule.lastExecutionTime);
            if (lastExec.getMonth() === nextDate.getMonth() && 
                lastExec.getFullYear() === nextDate.getFullYear() && 
                lastExec.getDate() === schedule.recurrenceDay) {
              nextDate.setMonth(nextDate.getMonth() + 1);
            }
          }
          
          // Handle cases where the day might not exist in some months
          // (e.g., 31st of February)
          if (nextDate.getDate() !== schedule.recurrenceDay) {
            // The date was adjusted to the last day of the month
            // Move to the next month and try again
            nextDate.setDate(1); // Move to 1st of the current month
            nextDate.setMonth(nextDate.getMonth() + 1); // Move to next month
            nextDate.setDate(schedule.recurrenceDay); // Try target day again
            
            // If it's still not matching, this day doesn't exist in this month either
            if (nextDate.getDate() !== schedule.recurrenceDay) {
              this.log(`Monthly schedule "${schedule.name}" has invalid day ${schedule.recurrenceDay} for the calculated month.`);
              return null;
            }
          }
          break;

        case 'yearly':
          if (!schedule.recurrenceDay || schedule.recurrenceDay < 1 || schedule.recurrenceDay > 31 ||
              !schedule.recurrenceMonth || schedule.recurrenceMonth < 1 || schedule.recurrenceMonth > 12) {
            this.log(`Yearly schedule "${schedule.name}" has invalid day/month: ${schedule.recurrenceDay}/${schedule.recurrenceMonth}.`);
            return null;
          }
          
          // Set to the specific month and day
          nextDate = new Date();
          nextDate.setMonth(schedule.recurrenceMonth - 1); // JavaScript months are 0-based
          nextDate.setDate(schedule.recurrenceDay);
          
          // If that date/time has already passed this year, move to next year
          if (nextDate < now || 
             (nextDate.getDate() === now.getDate() && nextDate.getMonth() === now.getMonth() &&
              (now.getHours() > targetHour || 
               (now.getHours() === targetHour && now.getMinutes() >= targetMinute)))) {
            
            nextDate.setFullYear(nextDate.getFullYear() + 1);
          }
          
          // If last execution was this year on the target date, move to next year
          if (schedule.lastExecutionTime) {
            const lastExec = new Date(schedule.lastExecutionTime);
            if (lastExec.getFullYear() === nextDate.getFullYear() && 
                lastExec.getMonth() === schedule.recurrenceMonth - 1 && 
                lastExec.getDate() === schedule.recurrenceDay) {
              nextDate.setFullYear(nextDate.getFullYear() + 1);
            }
          }
          
          // Handle invalid dates like February 30th
          if (nextDate.getMonth() !== schedule.recurrenceMonth - 1 || 
              nextDate.getDate() !== schedule.recurrenceDay) {
            this.log(`Yearly schedule "${schedule.name}" has invalid date: ${schedule.recurrenceDay}/${schedule.recurrenceMonth}.`);
            return null;
          }
          break;

        default:
          this.log(`Unknown recurrence type "${schedule.recurrenceType}" for schedule "${schedule.name}".`);
          return null;
      }
      
      // Set the time component
      nextDate.setHours(targetHour);
      nextDate.setMinutes(targetMinute);
      nextDate.setSeconds(0);
      nextDate.setMilliseconds(0);
      
      return nextDate > now ? nextDate : null;
    } else if (schedule.scheduleKind === 'cron') {
      if (!schedule.cronExpression) {
        this.log(`Schedule "${schedule.name}" (cron) is missing expression.`);
        return null;
      }
      try {
        // Use 'now' as the base for the next occurrence if no last execution or if last execution is old.
        // If there's a recent last execution, start searching from after that time.
        let cronStartDate = now;
        if (schedule.lastExecutionTime) {
            const lastExec = new Date(schedule.lastExecutionTime);
            if (lastExec > cronStartDate) { // If last execution is somehow later than now (e.g. clock changes)
                cronStartDate = new Date(lastExec.getTime() + 1000); // Start search 1s after last exec
            } else { // Normal case: last execution is in the past
                 // If cron is very frequent, ensure we don't pick the same last executed slot
                const tempParser = parser.parseExpression(schedule.cronExpression, {currentDate: lastExec});
                const nextAfterLast = tempParser.next().toDate();
                if(nextAfterLast > now) { // If the slot just after last exec is in future, use that
                    cronStartDate = new Date(lastExec.getTime() + 1000);
                }
            }
        }
        const interval = parser.parseExpression(schedule.cronExpression, { currentDate: cronStartDate });
        if (!interval.hasNext()) {
            this.log(`Cron schedule "${schedule.name}" has no future occurrences.`);
            return null;
        }
        return interval.next().toDate();
      } catch (err) {
        this.log(`Error parsing cron expression for "${schedule.name}": ${(err as Error).message}`);
        return null;
      }
    } else if (schedule.scheduleKind === 'interval') {
      if (!schedule.timeInterval || !schedule.timeUnit) {
        this.log(`Schedule "${schedule.name}" (interval) is missing interval/unit.`);
        return null;
      }
      
      const intervalVal = parseInt(schedule.timeInterval);
      if (isNaN(intervalVal) || intervalVal <= 0) {
        this.log(`Invalid timeInterval for "${schedule.name}": ${schedule.timeInterval}`);
        return null;
      }

      let intervalMs = 0;
      switch (schedule.timeUnit) {
        case 'minute': intervalMs = intervalVal * 60 * 1000; break;
        case 'hour': intervalMs = intervalVal * 60 * 60 * 1000; break;
        case 'day': intervalMs = intervalVal * 24 * 60 * 60 * 1000; break;
        default: this.log(`Invalid time unit for interval schedule "${schedule.name}": ${schedule.timeUnit}`); return null;
      }

      let referenceTime: Date;
      const hasConfiguredStartDate = !!schedule.startDate;

      if (hasConfiguredStartDate) {
        referenceTime = new Date(`${schedule.startDate}T${schedule.startHour || '00'}:${schedule.startMinute || '00'}:00`);
      } else if (schedule.lastExecutionTime) {
        referenceTime = new Date(schedule.lastExecutionTime);
      } else if (schedule.lastSkippedTime) {
        referenceTime = new Date(schedule.lastSkippedTime);
      } else {
        referenceTime = new Date(); // Default to now if no other reference
        if (schedule.startHour && schedule.startMinute) { // If creating new and only time is set
            referenceTime.setHours(parseInt(schedule.startHour));
            referenceTime.setMinutes(parseInt(schedule.startMinute));
            referenceTime.setSeconds(0);
            referenceTime.setMilliseconds(0);
        }
      }
      
      let nextTime = new Date(referenceTime.getTime());

      // If the reference time (e.g. last execution or configured start) is in the past,
      // advance it by intervals until it's in the future relative to 'now'.
      // If it's a configured start date, we want to align to those points in time.
      if (hasConfiguredStartDate) {
          while (nextTime <= now) {
              nextTime = new Date(nextTime.getTime() + intervalMs);
          }
      } else { // If based on last execution/skip or now, just add one interval if it's past
          if (nextTime <= now) {
            nextTime = new Date(nextTime.getTime() + intervalMs);
          }
          // If still in past (e.g. very short interval or system was off), catch up
          while (nextTime <= now) {
            nextTime = new Date(nextTime.getTime() + intervalMs);
          }
      }
      
      // For day intervals, ensure time is reset to specified start time if provided
      if (schedule.timeUnit === 'day' && schedule.startHour && schedule.startMinute) {
          nextTime.setHours(parseInt(schedule.startHour));
          nextTime.setMinutes(parseInt(schedule.startMinute));
          nextTime.setSeconds(0);
          nextTime.setMilliseconds(0);
      } else if (schedule.timeUnit !== 'day') { // For minute/hour, ensure seconds are zeroed
          nextTime.setSeconds(0);
          nextTime.setMilliseconds(0);
      }


      if (schedule.selectedDays && Object.values(schedule.selectedDays).some(Boolean)) {
        const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
        let attempts = 0;
        while (attempts < 7) {
          const dayOfWeek = nextTime.getDay();
          const dayKey = Object.keys(dayMap).find(key => dayMap[key] === dayOfWeek);
          
          if (dayKey && schedule.selectedDays[dayKey]) {
            if (nextTime > now) break; // Found a valid future day and time
            
            // If time is past for today, advance by one interval and re-check days
            nextTime = new Date(nextTime.getTime() + intervalMs);
            // attempts = 0; // Reset attempts as we shifted time, continue checking from new nextTime
            continue; // Re-evaluate this new time
          }
          
          // Not a selected day, or was a selected day but time was past and interval didn't make it future on a valid day
          // Advance to the next day, and reset time to startHour/Minute for that day
          nextTime.setDate(nextTime.getDate() + 1);
          if (schedule.startHour && schedule.startMinute) {
            nextTime.setHours(parseInt(schedule.startHour));
            nextTime.setMinutes(parseInt(schedule.startMinute));
          } else { // Default to midnight if no specific start time for day change
            nextTime.setHours(0);
            nextTime.setMinutes(0);
          }
          nextTime.setSeconds(0);
          nextTime.setMilliseconds(0);
          attempts++;
        }
        if (attempts >= 7 && (nextTime <= now || !schedule.selectedDays[Object.keys(dayMap).find(key => dayMap[key] === nextTime.getDay()) as string])) {
           this.log(`Could not find a valid future execution day for interval schedule "${schedule.name}" within a week.`);
           return null;
        }
      }
      
      return nextTime > now ? nextTime : null;
    }
    this.log(`Unknown schedule kind: ${schedule.scheduleKind} for schedule "${schedule.name}"`);
    return null;
  }

  private async executeSchedule(schedule: Schedule): Promise<void> {
    console.log('execute schedule', schedule)
    if (schedule.active === false) { // Check active status again before execution
      this.log(`Skipping execution of now inactive schedule "${schedule.name}"`);
      const timer = this.timers.get(schedule.id);
      if (timer) {
          clearTimeout(timer);
          this.timers.delete(schedule.id);
      }
      return;
    }
  
    // Check if schedule has expired
    if (schedule.expirationDate && schedule.expirationHour && schedule.expirationMinute) {
      const now = new Date();
      const expirationDateTime = new Date(
        `${schedule.expirationDate}T${schedule.expirationHour}:${schedule.expirationMinute}:00`
      );
      if (now > expirationDateTime) {
        this.log(`Schedule "${schedule.name}" has expired. Setting to inactive.`);
        await this.updateSchedule(schedule.id, { active: false, nextExecutionTime: undefined });
        return;
      }
    }
  
    this.log(`Executing schedule "${schedule.name}"`);

    if (schedule.requireActivity) {
      const lastExecutionTime = schedule.lastExecutionTime ? new Date(schedule.lastExecutionTime).getTime() : 0;
      const lastActivityTime = await RooService.getLastActivityTime(schedule.lastTaskId);
      if (lastActivityTime && lastActivityTime < lastExecutionTime) {
        this.log(`Skipping execution of "${schedule.name}" due to no activity since last execution. Rescheduling.`);
        this.setupTimerForSchedule(schedule); // Reschedule for next time
        return;
      }
    }

    try {
      const hasActiveTask = await RooService.hasActiveTask();
      if (hasActiveTask) {
        const taskInteraction = schedule.taskInteraction || "wait";
        switch (taskInteraction) {
          case "wait":
            const inactivityDelayMinutes = schedule.inactivityDelay ? parseInt(schedule.inactivityDelay) : 1;
            const inactivityDelayMs = inactivityDelayMinutes * 60 * 1000;
            try {
              const lastActivityTime = await RooService.getLastActivityTimeForActiveTask();
              const nowMs = Date.now();
              if (lastActivityTime && (nowMs - lastActivityTime) >= inactivityDelayMs) {
                this.log(`Task has been inactive for ${inactivityDelayMinutes} minute(s). Proceeding with schedule "${schedule.name}".`);
                await RooService.interruptActiveTask();
              } else {
                this.log(`Task is still active or hasn't been inactive for ${inactivityDelayMinutes} minute(s). Schedule "${schedule.name}" will re-check in 1 minute.`);
                const oneMinuteFromNow = new Date(Date.now() + 60000);
                await this.updateSchedule(schedule.id, { lastSkippedTime: new Date().toISOString(), nextExecutionTime: oneMinuteFromNow.toISOString() });
                const timer = setTimeout(() => this.executeSchedule(schedule), 60000);
                this.timers.set(schedule.id, timer);
                return;
              }
            } catch (error) {
              this.log(`Error checking task activity: ${error instanceof Error ? error.message : String(error)}. Re-checking in 1 min.`);
              const timer = setTimeout(() => this.executeSchedule(schedule), 60000);
              this.timers.set(schedule.id, timer);
              return;
            }
            break;
          case "interrupt":
            this.log(`Task already running. Schedule "${schedule.name}" will interrupt the current task.`);
            await RooService.interruptActiveTask();
            break;
          case "skip":
            this.log(`Task already running. Schedule "${schedule.name}" execution skipped. Rescheduling.`);
            await this.updateSchedule(schedule.id, { lastSkippedTime: new Date().toISOString() });
            this.setupTimerForSchedule(schedule); // Reschedule for next time
            return;
        }
      } 
    } catch (error) { 
      this.log(`Error during task interaction check: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const taskId = await this.processTask(schedule.mode, schedule.taskInstructions);
      await this.updateSchedule(schedule.id, {
        lastExecutionTime: new Date().toISOString(),
        lastTaskId: taskId,
      });

      if (schedule.scheduleKind === 'one-time') {
        this.log(`One-time schedule "${schedule.name}" executed. Marking inactive.`);
        await this.updateSchedule(schedule.id, { active: false, nextExecutionTime: undefined });
      } else {
        const reloadedSchedule = this.schedules.find(s => s.id === schedule.id);
        if (reloadedSchedule && reloadedSchedule.active) {
           this.setupTimerForSchedule(reloadedSchedule);
        }
      }
    } catch (error) {
      this.log(`Error executing schedule "${schedule.name}": ${error instanceof Error ? error.message : String(error)}`);
      if (schedule.scheduleKind !== 'one-time') {
          const reloadedScheduleOnError = this.schedules.find(s => s.id === schedule.id);
          if (reloadedScheduleOnError && reloadedScheduleOnError.active) {
              this.setupTimerForSchedule(reloadedScheduleOnError);
          }
      }
    }
  }

  private async processTask(mode: string, taskInstructions: string): Promise<string> {
    console.log('in process task', mode, taskInstructions);
    try {
      const taskId = await RooService.startTaskWithMode(mode, taskInstructions);
      console.log(`Successfully started task with mode "${mode}", taskId: ${taskId}`);
      return taskId;
    } catch (error) {
      console.log(`Error processing task: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  public async addScheduleProgrammatic(scheduleData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<Schedule> {
    const now = new Date().toISOString();
    const newSchedule: Schedule = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), // Simple unique ID
      ...scheduleData,
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.push(newSchedule);
    await this.saveSchedules();
    if (newSchedule.active !== false) {
      this.setupTimerForSchedule(newSchedule);
    }
    this.log(`Programmatically added schedule: "${newSchedule.name}"`);
    try {
      await vscode.commands.executeCommand('rootasker.schedulesUpdated');
    } catch (error) {
      this.log(`Error notifying webview of schedule update after programmatic add: ${error instanceof Error ? error.message : String(error)}`);
    }
    return newSchedule;
  }

  public async duplicateSchedule(scheduleId: string): Promise<Schedule | undefined> {
    const sourceSchedule = this.schedules.find(s => s.id === scheduleId);
    if (!sourceSchedule) {
      this.log(`Schedule with ID ${scheduleId} not found for duplication.`);
      return undefined;
    }

    const now = new Date().toISOString();
    const newSchedule: Schedule = {
      ...JSON.parse(JSON.stringify(sourceSchedule)), // Deep clone to avoid reference issues
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), // New unique ID
      name: `${sourceSchedule.name} - Copy`,
      active: false, // Start as inactive by default
      createdAt: now,
      updatedAt: now,
      lastExecutionTime: undefined, // Reset execution history
      lastSkippedTime: undefined,
      lastTaskId: undefined,
      nextExecutionTime: undefined, // Will be calculated when activated
      executionCount: 0, // Reset execution count
    };

    this.schedules.push(newSchedule);
    await this.saveSchedules();
    
    this.log(`Duplicated schedule "${sourceSchedule.name}" to "${newSchedule.name}"`);
    
    try {
      await vscode.commands.executeCommand('rootasker.schedulesUpdated');
    } catch (error) {
      this.log(`Error notifying webview of schedule update after duplication: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return newSchedule;
  }

  public async deleteScheduleProgrammatic(scheduleId: string): Promise<boolean> {
    const scheduleIndex = this.schedules.findIndex(s => s.id === scheduleId);
    if (scheduleIndex === -1) {
      this.log(`Schedule with ID ${scheduleId} not found for programmatic deletion.`);
      return false;
    }

    const scheduleName = this.schedules[scheduleIndex].name;
    this.schedules.splice(scheduleIndex, 1);
    
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }

    await this.saveSchedules();
    this.log(`Programmatically deleted schedule: "${scheduleName}" (ID: ${scheduleId})`);
    try {
      await vscode.commands.executeCommand('rootasker.schedulesUpdated');
    } catch (error) {
      this.log(`Error notifying webview of schedule update after programmatic delete: ${error instanceof Error ? error.message : String(error)}`);
    }
    return true;
  }

  public getScheduleById(scheduleId: string): Schedule | undefined {
    return this.schedules.find(s => s.id === scheduleId);
  }

  public getAllSchedules(): Schedule[] {
    return [...this.schedules]; // Return a copy
  }

  public async runScheduleNow(scheduleId: string): Promise<void> {
    const schedule = this.schedules.find(s => s.id === scheduleId);
    if (!schedule) {
      this.log(`Schedule with ID ${scheduleId} not found for "Run Now".`);
      vscode.window.showErrorMessage(`Schedule with ID ${scheduleId} not found.`);
      return;
    }

    this.log(`"Run Now" triggered for schedule: "${schedule.name}" (ID: ${scheduleId})`);
    try {
      // We call processTask directly to avoid interfering with regular scheduling logic
      // like lastExecutionTime updates or automatic rescheduling, unless desired.
      // For now, this is an ad-hoc execution.
      const taskId = await this.processTask(schedule.mode, schedule.taskInstructions);
      this.log(`"Run Now" for schedule "${schedule.name}" started task ${taskId}.`);
      vscode.window.showInformationMessage(`Task "${schedule.name}" started manually.`);
      // Optionally, we could update a "lastManuallyRunTime" or similar if needed.
      // We do NOT call setupTimerForSchedule here as this is an out-of-band execution.
    } catch (error) {
      this.log(`Error during "Run Now" for schedule "${schedule.name}": ${error instanceof Error ? error.message : String(error)}`);
      vscode.window.showErrorMessage(`Failed to run task "${schedule.name}" manually: ${error instanceof Error ? error.message : String(error)}`);
    }
   }
  
   public async runProjectSchedule(schedule: BaseSchedule): Promise<void> {
    this.log(`Running project schedule: "${schedule.name}" (ID: ${schedule.id}) from project ID ${schedule.projectId}`);
    try {
    	// We call processTask directly to execute the schedule's defined task
    	const taskId = await this.processTask(schedule.mode, schedule.taskInstructions);
    	this.log(`"Run Now" for project schedule "${schedule.name}" (Project: ${schedule.projectId}) started task ${taskId}.`);
    	vscode.window.showInformationMessage(`Task "${schedule.name}" (from project) started manually.`);
    	// Note: This ad-hoc execution does not update lastExecutionTime or other schedule properties
    	// as it's an out-of-band execution. Regular scheduling remains unaffected.
    } catch (error) {
    	this.log(`Error during "Run Now" for project schedule "${schedule.name}" (Project: ${schedule.projectId}): ${error instanceof Error ? error.message : String(error)}`);
    	vscode.window.showErrorMessage(`Failed to run task "${schedule.name}" (from project) manually: ${error instanceof Error ? error.message : String(error)}`);
    }
   }
  
   public async reloadSchedulesAndReschedule(): Promise<void> {
    this.log("Reloading schedules and rescheduling timers due to external update");
    await this.loadSchedules();
    this.setupTimers();
   }
  }
