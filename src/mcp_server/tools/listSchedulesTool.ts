import { SchedulerService, Schedule } from '../../services/scheduler/SchedulerService';

// Define plain object types for schemas since SDK types are not available
type PlainMcpToolSchema = { type: string; properties: Record<string, any>; required?: string[] };


export class ListSchedulesTool { // Removed "implements McpTool" for now
  name = "list_schedules";
  description = "Lists all configured schedules in RooTasker. These are automated tasks that run in Roo Code at scheduled times (cron jobs, intervals, or one-time) or when file changes are detected. Each schedule can trigger Roo Code to automatically execute tasks, run code, or interact with files.";
  inputSchema: PlainMcpToolSchema = { type: "object", properties: {} }; 
  outputSchema: PlainMcpToolSchema = { // Using PlainMcpToolSchema, McpServer might not use this directly
    type: "object",
    properties: {
      schedules: {
        type: "array",
        items: {
          // Define a simplified Schedule schema for MCP, or reference a shared one
          // For now, let's assume it returns the full Schedule object structure
          type: "object", 
        }
      }
    }
  };

  private schedulerService: SchedulerService;

  constructor(schedulerService: SchedulerService) {
    this.schedulerService = schedulerService;
  }

  async handler(inputs: any): Promise<{ schedules: Schedule[] }> {
    try {
      const schedules = this.schedulerService.getAllSchedules();
      return { schedules };
    } catch (error) {
      console.error(`Error in ListSchedulesTool: ${error instanceof Error ? error.message : String(error)}`);
      // Re-throw or return a structured error for MCP
      throw new Error(`Failed to list schedules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
