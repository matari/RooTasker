import { SchedulerService, Schedule } from '../../services/scheduler/SchedulerService';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };

export class ToggleScheduleActiveTool {
  name = "toggle_schedule_active";
  description = "Enables or disables a scheduled task in RooTasker. When disabled, the task will not execute at its scheduled times but retains all configuration. When enabled, the task will resume executing according to its schedule. Use this for temporarily stopping tasks without deleting them.";
  inputSchema: PlainMcpToolSchema = {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "The unique ID of the scheduled task to enable/disable." },
      active: { type: "boolean", description: "Set to true to enable the schedule, false to disable it." }
    },
    required: ["scheduleId", "active"]
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

  async handler(inputs: { scheduleId: string, active: boolean }): Promise<{ success: boolean; schedule?: Schedule; error?: string }> {
    try {
      await this.schedulerService.toggleScheduleActive(inputs.scheduleId, inputs.active);
      // Fetch the updated schedule to return its new state
      const updatedSchedule = this.schedulerService.getScheduleById(inputs.scheduleId);
      if (updatedSchedule) {
        return { success: true, schedule: updatedSchedule };
      } else {
        // Should not happen if toggleScheduleActive didn't throw for not found
        return { success: false, error: "Schedule not found after toggle." }; 
      }
    } catch (error) {
      console.error(`Error in ToggleScheduleActiveTool: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
