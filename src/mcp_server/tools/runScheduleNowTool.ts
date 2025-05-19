import { SchedulerService } from '../../services/scheduler/SchedulerService';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };

export class RunScheduleNowTool {
  name = "run_schedule_now";
  description = "Immediately executes a scheduled task in RooTasker, bypassing its normal schedule. This triggers Roo Code to run the task instructions in the configured mode right away, regardless of when it was next scheduled to run. Useful for testing schedules or running urgent tasks on-demand.";
  inputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "The unique ID of the scheduled task to execute immediately." }
    },
    required: ["scheduleId"]
  };
  outputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      message: { type: "string" }, // e.g., "Task triggered successfully" or error message
      error: { type: "string" }
    }
  };

  private schedulerService: SchedulerService;

  constructor(schedulerService: SchedulerService) {
    this.schedulerService = schedulerService;
  }

  async handler(inputs: { scheduleId: string }): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.schedulerService.runScheduleNow(inputs.scheduleId);
      // runScheduleNow in service already logs and shows info/error messages
      return { success: true, message: `Schedule ${inputs.scheduleId} triggered to run now.` };
    } catch (error) {
      // This catch might be redundant if runScheduleNow handles its own errors and doesn't rethrow
      // but good for safety.
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error in RunScheduleNowTool: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}
