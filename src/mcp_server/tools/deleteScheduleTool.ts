import { SchedulerService } from '../../services/scheduler/SchedulerService';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };

export class DeleteScheduleTool {
  name = "delete_schedule";
  description = "Permanently deletes a scheduled task from RooTasker. This will stop all future executions of the automated task and remove all its configuration. Use this when a scheduled task is no longer needed or needs to be completely recreated.";
  inputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "The unique ID of the scheduled task to permanently delete." }
    },
    required: ["scheduleId"]
  };
  outputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      error: { type: "string" }
    }
  };

  private schedulerService: SchedulerService;

  constructor(schedulerService: SchedulerService) {
    this.schedulerService = schedulerService;
  }

  async handler(inputs: { scheduleId: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const success = await this.schedulerService.deleteScheduleProgrammatic(inputs.scheduleId);
      if (success) {
        return { success: true };
      } else {
        return { success: false, error: "Schedule not found or deletion failed." };
      }
    } catch (error) {
      console.error(`Error in DeleteScheduleTool: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
