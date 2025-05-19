import * as vscode from 'vscode'; // For context
import { SchedulerService, Schedule } from '../../services/scheduler/SchedulerService';
import { CustomModesManager } from '../../core/config/CustomModesManager';
import { getAllModes } from '../../shared/modes';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };

// Define the input type, excluding auto-generated fields
type CreateScheduleInput = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName' | 'lastExecutionTime' | 'lastSkippedTime' | 'lastTaskId' | 'nextExecutionTime'>;

export class CreateScheduleTool { // Removed "implements McpTool"
  name = "create_schedule";
  description = "Creates a new automated schedule in RooTasker that will run Roo Code tasks. Supports three types: 1) Recurring cron jobs (daily, weekly, monthly with cron expressions), 2) Interval-based tasks (every N minutes/hours/days), 3) One-time scheduled execution. These schedules automatically trigger Roo Code to execute the specified task instructions in the selected mode at the configured times.";
  // Define a more specific input schema based on CreateScheduleInput
  inputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "Descriptive name for this scheduled task." },
      mode: { type: "string", description: "Roo Code mode (e.g., 'code', 'architect', 'chat') that will execute the task." },
      taskInstructions: { type: "string", description: "Detailed instructions for Roo Code to execute when this schedule triggers." },
      scheduleKind: { type: "string", enum: ["one-time", "interval", "cron"], description: "Type of schedule: 'one-time' for single execution, 'interval' for recurring every N units, 'cron' for complex schedules." },
      cronExpression: { type: "string", description: "Cron expression for complex schedules (required if scheduleKind is 'cron'). Example: '0 9 * * 1-5' for weekdays at 9 AM." },
      timeInterval: { type: "string", description: "Interval number for recurring tasks (required if scheduleKind is 'interval'). Example: '30' for every 30 units." },
      timeUnit: { type: "string", enum: ["minute", "hour", "day"], description: "Time unit for interval schedule (required if scheduleKind is 'interval')." },
      selectedDays: { type: "object", description: "Days selection for interval schedules. Object with day keys (mon, tue, wed, thu, fri, sat, sun) set to true/false." },
      startDate: { type: "string", description: "Start date in YYYY-MM-DD format (required for one-time and interval schedules)." },
      startHour: { type: "string", description: "Start hour in 24-hour format 00-23 (required for one-time and interval schedules)." },
      startMinute: { type: "string", description: "Start minute 00-59 (required for one-time and interval schedules)." },
      expirationDate: { type: "string", description: "Optional expiration date in YYYY-MM-DD format. Schedule stops after this date." },
      expirationHour: { type: "string", description: "Optional expiration hour in 24-hour format 00-23." },
      expirationMinute: { type: "string", description: "Optional expiration minute 00-59." },
      requireActivity: { type: "boolean", description: "If true, only runs when there was recent IDE activity (prevents running on idle/closed machines)." },
      active: { type: "boolean", description: "Whether the schedule is enabled and will run. Defaults to true." },
      taskInteraction: { type: "string", enum: ["wait", "interrupt", "skip"], description: "Behavior when Roo Code is already running a task: 'wait' (queue), 'interrupt' (stop current), 'skip' (don't run)." },
      inactivityDelay: { type: "string", description: "Minutes to wait for Roo Code inactivity before running (only used with 'wait' taskInteraction)." },
    },
    required: ["name", "mode", "taskInstructions", "scheduleKind"]
  };
  outputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      schedule: { type: "object" }, // Define more detailed schedule schema if needed
      error: { type: "string" }
    }
  };

  private schedulerService: SchedulerService;
  private context: vscode.ExtensionContext;

  constructor(schedulerService: SchedulerService, context: vscode.ExtensionContext) {
    this.schedulerService = schedulerService;
    this.context = context; // Needed for CustomModesManager
  }

  async handler(inputs: CreateScheduleInput): Promise<{ success: boolean; schedule?: Schedule; error?: string }> {
    try {
      const customModesManager = new CustomModesManager(this.context, async () => {}); // Callback might not be essential here
      const availableModes = getAllModes(await customModesManager.getCustomModes());
      const modeConfig = availableModes.find(m => m.slug === inputs.mode);
      
      const fullScheduleData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'> = {
        ...inputs,
        modeDisplayName: modeConfig?.name || inputs.mode,
        // Ensure optional fields that are not part of CreateScheduleInput are handled if necessary
        // For example, if they should default to undefined if not provided in inputs
        cronExpression: inputs.cronExpression || undefined,
        timeInterval: inputs.timeInterval || undefined,
        timeUnit: inputs.timeUnit || undefined,
        selectedDays: inputs.selectedDays || undefined,
        startDate: inputs.startDate || undefined,
        startHour: inputs.startHour || undefined,
        startMinute: inputs.startMinute || undefined,
        expirationDate: inputs.expirationDate || undefined,
        expirationHour: inputs.expirationHour || undefined,
        expirationMinute: inputs.expirationMinute || undefined,
        requireActivity: inputs.requireActivity !== undefined ? inputs.requireActivity : false,
        active: inputs.active !== undefined ? inputs.active : true,
        taskInteraction: inputs.taskInteraction || "wait",
        inactivityDelay: inputs.inactivityDelay || undefined,
      };
      
      const newSchedule = await this.schedulerService.addScheduleProgrammatic(fullScheduleData);
      return { success: true, schedule: newSchedule };
    } catch (error) {
      console.error(`Error in CreateScheduleTool: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
