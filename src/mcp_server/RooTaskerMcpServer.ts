import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; // McpTool import removed if not used
import { SchedulerService } from '../services/scheduler/SchedulerService';
import { ListSchedulesTool } from './tools/listSchedulesTool';
import { CreateScheduleTool } from './tools/createScheduleTool';
import { GetScheduleTool } from './tools/getScheduleTool';
import { UpdateScheduleTool } from './tools/updateScheduleTool';
import { DeleteScheduleTool } from './tools/deleteScheduleTool';
import { ToggleScheduleActiveTool } from './tools/toggleScheduleActiveTool';
import { RunScheduleNowTool } from './tools/runScheduleNowTool';

export class RooTaskerMcpServer {
  private mcpServer: McpServer;
  private schedulerService: SchedulerService;
  private context: vscode.ExtensionContext;
  private serverName: string;
  private serverDisplayName: string;

  constructor(context: vscode.ExtensionContext, schedulerService: SchedulerService) {
    this.context = context;
    this.schedulerService = schedulerService;
    
    this.serverName = "rootasker-scheduler"; 
    this.serverDisplayName = "RooTasker Scheduler MCP Server";
    
    this.mcpServer = new McpServer({
      name: this.serverName,
      version: "1.0.0",
      displayName: this.serverDisplayName,
      description: "Manages automated scheduled tasks, recurring cron jobs, and file watchers that trigger Roo Code to execute tasks. Create intervals (every N minutes/hours/days), cron schedules (complex timing), or one-time tasks that run Roo Code instructions automatically in specified modes.",
      icon: "$(calendar)",
      publisher: "RooTasker",
    });

    this.registerTools();
  }

  private registerTools() {
    // Define a simple interface for our tool structure if McpTool from SDK is problematic
    interface RooTaskerTool {
      name: string;
      description: string;
      inputSchema: any; // Using 'any' for now, assuming JSON schema object
      outputSchema?: any;
      handler: (...args: any[]) => Promise<any>;
      [key: string]: any; // Allow other properties if needed by specific tools
    }

    const toolsToRegister: RooTaskerTool[] = [ // Changed McpTool[] to RooTaskerTool[]
      new ListSchedulesTool(this.schedulerService),
      new CreateScheduleTool(this.schedulerService, this.context),
      new GetScheduleTool(this.schedulerService),
      new UpdateScheduleTool(this.schedulerService, this.context),
      new DeleteScheduleTool(this.schedulerService),
      new ToggleScheduleActiveTool(this.schedulerService),
      new RunScheduleNowTool(this.schedulerService),
    ];

    toolsToRegister.forEach(tool => {
      // Use the server.tool() method signature: name, inputSchema (or Zod schema), handler
      // Assuming tool.inputSchema is a JSON schema object for now.
      // The handler in our tool classes is already async and takes an 'inputs' object.
      this.mcpServer.tool(tool.name, tool.inputSchema as any, tool.handler.bind(tool));
      console.log(`Registered MCP tool: ${tool.name}`);
    });
    
    console.log("All RooTasker MCP tools registered.");
  }

  public start() {
    // Logic to make the server discoverable by Cline's MCP Hub
    // This depends on how the @modelcontextprotocol/sdk handles embedded servers
    // or if there's a global McpHub to register with.
    // For example, if there's a global hub exposed by another extension (like Cline itself):
    // const mcpHub = vscode.extensions.getExtension('cline.mcp-hub-extension-id')?.exports?.getHub();
    // if (mcpHub) {
    //   mcpHub.registerServer(this.mcpServer); // This line might be SDK specific for how a server makes itself known
    //   console.log(`${this.mcpServer.displayName} registered with MCP Hub.`); // Use direct property if available
    // } else {
    //   console.warn("MCP Hub not found. RooTasker MCP Server will not be available.");
    // }
    console.log(`${this.serverDisplayName} started (simulated).`);
  }

  public dispose() {
    // Logic to unregister from MCP Hub and clean up
    console.log(`${this.serverDisplayName} disposed.`);
  }
}
