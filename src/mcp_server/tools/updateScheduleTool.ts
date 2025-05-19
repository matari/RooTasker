import * as vscode from 'vscode';
import { SchedulerService, Schedule } from '../../services/scheduler/SchedulerService';
import { CustomModesManager } from '../../core/config/CustomModesManager';
import { getAllModes } from '../../shared/modes';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };

type UpdateScheduleInput = Partial<Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName' | 'lastExecutionTime' | 'lastSkippedTime' | 'lastTaskId' | 'nextExecutionTime'>> & { mode?: string };

export class UpdateScheduleTool {
  name = "update_schedule";
  description = "Updates an existing scheduled task in RooTasker. Can modify any aspect of the schedule including timing (cron expression, interval, dates), Roo Code mode, task instructions, execution behavior, and activation status. Use this to reschedule tasks, change their instructions, or adjust how they interact with running Roo Code processes.";
  inputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "The unique ID of the scheduled task to update." },
      updates: {
        type: "object",
        properties: {
          name: { type: "string", description: "New descriptive name for the scheduled task." },
          mode: { type: "string", description: "New Roo Code mode (e.g., 'code', 'architect', 'chat') for task execution." },
          taskInstructions: { type: "string", description: "Updated instructions for Roo Code to execute." },
          scheduleKind: { type: "string", enum: ["one-time", "interval", "cron"], description: "Change schedule type." },
          cronExpression: { type: "string", description: "New cron expression for complex scheduling." },
          timeInterval: { type: "string", description: "New interval number for recurring tasks." },
          timeUnit: { type: "string", enum: ["minute", "hour", "day"], description: "New time unit for interval schedule." },
          selectedDays: { type: "object", description: "Updated days selection for interval schedules." },
          startDate: { type: "string", description: "New start date in YYYY-MM-DD format." },
          startHour: { type: "string", description: "New start hour in 24-hour format 00-23." },
          startMinute: { type: "string", description: "New start minute 00-59." },
          expirationDate: { type: "string", description: "New expiration date in YYYY-MM-DD format." },
          expirationHour: { type: "string", description: "New expiration hour in 24-hour format 00-23." },
          expirationMinute: { type: "string", description: "New expiration minute 00-59." },
          requireActivity: { type: "boolean", description: "Update activity requirement for execution." },
          active: { type: "boolean", description: "Enable/disable the scheduled task." },
          taskInteraction: { type: "string", enum: ["wait", "interrupt", "skip"], description: "Update behavior when Roo Code is busy." },
          inactivityDelay: { type: "string", description: "Update inactivity delay in minutes." },
        },
        description: "Object containing fields to update. Only provided fields will be changed."
      }
    },
    required: ["scheduleId", "updates"]
  };
  outputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      schedule: { type: "object" },
      error: { type: "string" }
    }
  };

  private schedulerService: SchedulerService;
  private context: vscode.ExtensionContext;

  constructor(schedulerService: SchedulerService, context: vscode.ExtensionContext) {
    this.schedulerService = schedulerService;
    this.context = context;
  }

  async handler(inputs: { scheduleId: string, updates: UpdateScheduleInput }): Promise<{ success: boolean; schedule?: Schedule; error?: string }> {
    try {
      let finalUpdates: Partial<Schedule> = { ...inputs.updates }; // Cast to Partial<Schedule> for updateSchedule method

      if (inputs.updates.mode) {
        const customModesManager = new CustomModesManager(this.context, async () => {});
        const availableModes = getAllModes(await customModesManager.getCustomModes());
        const modeConfig = availableModes.find(m => m.slug === inputs.updates.mode);
        finalUpdates.modeDisplayName = modeConfig?.name || inputs.updates.mode;
      }
      
      const updatedSchedule = await this.schedulerService.updateSchedule(inputs.scheduleId, finalUpdates);
      if (updatedSchedule) {
        return { success: true, schedule: updatedSchedule };
      } else {
        return { success: false, error: "Schedule not found or update failed." };
      }
    } catch (error) {
      console.error(`Error in UpdateScheduleTool: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
