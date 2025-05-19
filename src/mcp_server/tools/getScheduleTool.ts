import { SchedulerService, Schedule } from '../../services/scheduler/SchedulerService';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };

export class GetScheduleTool {
  name = "get_schedule_details";
  description = "Retrieves detailed information about a specific scheduled task in RooTasker. Shows configuration including schedule type (cron, interval, one-time), timing details, Roo Code mode, task instructions, execution history, and current status.";
  inputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "The unique ID of the scheduled task to retrieve." }
    },
    required: ["scheduleId"]
  };
  outputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      schedule: { type: "object" }, // Or more specific Schedule schema
      error: { type: "string" }
    }
  };

  private schedulerService: SchedulerService;

  constructor(schedulerService: SchedulerService) {
    this.schedulerService = schedulerService;
  }

  async handler(inputs: { scheduleId: string }): Promise<{ success: boolean; schedule?: Schedule; error?: string }> {
    try {
      const schedule = this.schedulerService.getScheduleById(inputs.scheduleId);
      if (schedule) {
        return { success: true, schedule };
      } else {
        return { success: false, error: "Schedule not found." };
      }
    } catch (error) {
      console.error(`Error in GetScheduleTool: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
