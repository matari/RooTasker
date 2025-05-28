# MCP Argument Passing Issue Investigation Plan

## Problem Summary
MCP tools are receiving empty objects `{}` instead of the provided arguments, causing:
- Projects created with default values ("Unnamed Project", empty description)
- Schedules created with only metadata (id, timestamps) but no actual data

## Evidence
From VSCode Output logs:
```
DEBUG: UPDATED VERSION - Received projectData: {}
DEBUG: Project data with defaults: {
  "name": "Unnamed Project", 
  "description": "",
  "directoryPath": "c:\\Users\\matar\\Desktop\\_dev\\RooTasker",
  "color": "#d9edf2"
}
```

## Root Cause Analysis

### 1. MCP Tool Handler Signature Issue
The MCP SDK might be calling tool handlers with a different argument structure than expected.

**Current Implementation:**
```typescript
async handler(args: any): Promise<CallToolResult> {
  const projectData: CreateProjectMcpInput = {
    name: args.name,           // These are undefined
    description: args.description,
    directoryPath: args.directoryPath,
    color: args.color
  };
}
```

**Potential Issues:**
- Arguments might be wrapped in an additional object
- MCP SDK might pass arguments as `handler(argumentsObject, context)` 
- Tool registration binding might be incorrect

### 2. Tool Registration Issue
In `RooTaskerMcpServer.ts`:
```typescript
mcpServer.tool(tool.name, tool.inputSchema as any, tool.handler.bind(tool));
```

**Potential Issues:**
- `tool.handler.bind(tool)` might not preserve argument structure
- MCP SDK expects different handler signature

### 3. MCP Client-Server Communication Issue
Arguments might be lost during HTTP transport between MCP client and server.

## Investigation Steps

### Step 1: Enhanced Debugging
Add comprehensive logging to trace argument flow:

1. **MCP Tool Handler**: Log raw arguments received
2. **VSCode Command**: Log what's actually passed
3. **MCP Server Registration**: Verify tool registration

### Step 2: Test Different Argument Structures
Test if arguments are passed in different formats:
- `handler(args)`
- `handler({ arguments: args })`
- `handler(args, context)`

### Step 3: Compare Working vs Non-Working Tools
- Check if any MCP tools work correctly
- Compare argument handling patterns

### Step 4: MCP SDK Documentation Review
- Verify correct tool handler signature
- Check MCP SDK examples for proper implementation

## Immediate Fix Strategy

1. **Add Comprehensive Logging**: Modify CreateProjectTool to log everything
2. **Handle Multiple Argument Formats**: Make tool robust to different argument structures
3. **Test with Simple Tool**: Create minimal test tool to isolate issue
4. **Verify MCP Server Setup**: Ensure proper tool registration

## Expected Outcome
After investigation, we should:
1. Identify exact argument structure received by tools
2. Fix argument extraction in all MCP tools
3. Ensure proper data flow from MCP client → VSCode commands
4. Verify all tools (projects, schedules, watchers) work correctly

## Files to Modify
- `src/mcp_server/tools/CreateProjectTool.ts` - Enhanced debugging
- `src/mcp_server/tools/createScheduleTool.ts` - Fix argument handling  
- `src/mcp_server/RooTaskerMcpServer.ts` - Verify registration
- Other MCP tools as needed

## Success Criteria
- MCP tools receive correct arguments
- Projects created with provided name/description
- Schedules created with provided data
- All MCP functionality works as expected