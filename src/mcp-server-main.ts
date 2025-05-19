#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js'; // Removed RequestSchemaOutput
import { z } from 'zod'; // Assuming zod is available
import { ListSchedulesTool } from './mcp_server/tools/listSchedulesTool.js';
import { CreateScheduleTool } from './mcp_server/tools/createScheduleTool.js';
import { GetScheduleTool } from './mcp_server/tools/getScheduleTool.js';
import { UpdateScheduleTool } from './mcp_server/tools/updateScheduleTool.js';
import { DeleteScheduleTool } from './mcp_server/tools/deleteScheduleTool.js';
import { ToggleScheduleActiveTool } from './mcp_server/tools/toggleScheduleActiveTool.js';
import { RunScheduleNowTool } from './mcp_server/tools/runScheduleNowTool.js';

// Mock implementation of SchedulerService for standalone operation
// This would interface with your actual data storage (files, database, etc.)
class StandaloneSchedulerService {
  private schedules: any[] = [];

  getAllSchedules() {
    return this.schedules;
  }

  getScheduleById(id: string) {
    return this.schedules.find(s => s.id === id);
  }

  async addScheduleProgrammatic(scheduleData: any) {
    const newSchedule = {
      ...scheduleData,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.schedules.push(newSchedule);
    return newSchedule;
  }

  async updateSchedule(id: string, updates: any) {
    const index = this.schedules.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Schedule not found');
    
    this.schedules[index] = { ...this.schedules[index], ...updates, updatedAt: new Date() };
    return this.schedules[index];
  }

  async deleteScheduleProgrammatic(id: string) {
    const index = this.schedules.findIndex(s => s.id === id);
    if (index === -1) return false;
    
    this.schedules.splice(index, 1);
    return true;
  }

  async toggleScheduleActive(id: string, active: boolean) {
    const schedule = this.getScheduleById(id);
    if (!schedule) throw new Error('Schedule not found');
    
    schedule.active = active;
    schedule.updatedAt = new Date();
    return schedule;
  }

  async runScheduleNow(id: string) {
    const schedule = this.getScheduleById(id);
    if (!schedule) throw new Error('Schedule not found');
    
    // Simulate running the schedule
    console.log(`Running schedule ${id}: ${schedule.name}`);
    return true;
  }
}

// Create server instance
const server = new Server({
  name: "rootasker-scheduler",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

// Initialize standalone scheduler service
const schedulerService = new StandaloneSchedulerService();

// Create tool instances
const tools = [
  new ListSchedulesTool(schedulerService as any),
  new CreateScheduleTool(schedulerService as any, null as any), // Pass null for context in standalone mode
  new GetScheduleTool(schedulerService as any),
  new UpdateScheduleTool(schedulerService as any, null as any),
  new DeleteScheduleTool(schedulerService as any),
  new ToggleScheduleActiveTool(schedulerService as any),
  new RunScheduleNowTool(schedulerService as any),
];

// Register tools with the server
tools.forEach(tool => {
  const toolCallSchema = z.object({
    method: z.literal(`tools/call/${tool.name}`),
    params: z.object({
      arguments: z.any().optional(),
    }),
  });
  server.setRequestHandler(toolCallSchema, async (request: z.infer<typeof toolCallSchema>) => {
    try {
      const result = await tool.handler(request.params.arguments || {});
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      throw error;
    }
  });
});

// Handle tool listing
const toolListSchema = z.object({
  method: z.literal("tools/list"),
});
server.setRequestHandler(toolListSchema, async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

// Handle server info
const initializeSchema = z.object({
  method: z.literal("initialize"),
});
server.setRequestHandler(initializeSchema, async () => {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {}
    },
    serverInfo: {
      name: "rootasker-scheduler",
      version: "1.0.0",
      description: "RooTasker MCP Server - Manages automated scheduled tasks, recurring cron jobs, and file watchers that trigger Roo Code to execute tasks. Create time-based automation for your development workflow."
    }
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RooTasker MCP Server started on stdio - Ready to manage automated tasks for Roo Code");
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.error("Shutting down RooTasker MCP Server...");
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error("Shutting down RooTasker MCP Server...");
  process.exit(0);
});

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
