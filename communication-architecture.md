# Roo+ to Roo Code Communication Architecture

## Current Status and Challenge

We've been trying to establish communication between Roo+ and Roo Code using the Model Context Protocol (MCP) server approach. Despite our efforts to configure a standalone MCP server and properly mock VS Code's environment, we're still experiencing connectivity issues with the "Method not found" error when attempting to use tools like `CreateProjectTool`.

## Available Communication Approaches

### 1. VS Code Commands API (Recommended)

Looking at the `extension.ts` code, I notice that Roo+ already implements VS Code command-based APIs for scheduler operations. This pattern can be extended to support project operations as well.

```typescript
// Already implemented for schedules
vscode.commands.registerCommand('rooplus.api.createSchedule', async (scheduleData) => { ... });
vscode.commands.registerCommand('rooplus.api.updateSchedule', async (args) => { ... });
vscode.commands.registerCommand('rooplus.api.deleteSchedule', async (args) => { ... });

// We can add similar commands for projects
vscode.commands.registerCommand('rooplus.api.createProject', async (projectData) => { ... });
vscode.commands.registerCommand('rooplus.api.updateProject', async (args) => { ... });
vscode.commands.registerCommand('rooplus.api.deleteProject', async (args) => { ... });
```

In Roo Code, these commands can be executed:

```typescript
const project = await vscode.commands.executeCommand(
  'rooplus.api.createProject',
  {
    name: 'Test Project',
    description: 'Created from Roo Code'
  }
);
```

### 2. Extension API Exports

Extensions can expose functionality through their exports:

```typescript
// In Roo+'s extension.ts
export function activate(context: vscode.ExtensionContext) {
  // Create API
  const api = {
    createProject: (name, description) => { /* implementation */ },
    // Other functions...
  };
  
  // Expose API
  return api;
}
```

In Roo Code:
```typescript
const rooplusExtension = vscode.extensions.getExtension('MrMatari.rooplus'); // Publisher and name updated
if (rooplusExtension) {
  const api = rooplusExtension.exports;
  api.createProject('Test Project', 'Created from Roo Code');
}
```

### 3. Shared Storage

Use VS Code's global state storage for inter-extension communication:

```typescript
// In Roo+ (listening for changes)
const SHARED_KEY = 'rooplus.projectRequests';
setInterval(async () => {
  const requests = context.globalState.get(SHARED_KEY) || [];
  if (requests.length > 0) {
    // Process requests
    // Clear processed requests
    await context.globalState.update(SHARED_KEY, []);
  }
}, 1000);
```

In Roo Code:
```typescript
const requests = context.globalState.get(SHARED_KEY) || [];
requests.push({ 
  type: 'createProject', 
  name: 'Test Project', 
  description: 'Created from Roo Code' 
});
await context.globalState.update(SHARED_KEY, requests);
```

## Implementation Plan

### Phase 1: Command-Based API for Projects

1. Add Project API commands to Roo+'s `extension.ts`:

```typescript
// Register Project API commands
context.subscriptions.push(
  vscode.commands.registerCommand('rooplus.api.createProject', async (projectData: {
    name: string,
    description?: string,
    directoryPath?: string,
    color?: string
  }) => {
    try {
      const newProject = await projectStorageService.addProject(projectData);
      return { success: true, project: newProject };
    } catch (error) {
      outputChannel.appendLine(`Error in rooplus.api.createProject: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('rooplus.api.getProject', async (args: { projectId: string }) => {
    try {
      const project = await projectStorageService.getProject(args.projectId);
      return { success: true, project: project };
    } catch (error) {
      outputChannel.appendLine(`Error in rooplus.api.getProject: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('rooplus.api.listProjects', async () => {
    try {
      const projects = await projectStorageService.getProjects();
      return { success: true, projects: projects };
    } catch (error) {
      outputChannel.appendLine(`Error in rooplus.api.listProjects: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('rooplus.api.updateProject', async (args: { 
    projectId: string, 
    updates: {
      name?: string,
      description?: string,
      directoryPath?: string,
      color?: string
    } 
  }) => {
    try {
      const project = await projectStorageService.getProject(args.projectId);
      if (!project) {
        return { success: false, error: `Project with ID ${args.projectId} not found` };
      }
      
      const updatedProject = await projectStorageService.updateProject({
        ...project,
        ...args.updates
      });
      
      return { success: true, project: updatedProject };
    } catch (error) {
      outputChannel.appendLine(`Error in rooplus.api.updateProject: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('rooplus.api.deleteProject', async (args: { projectId: string }) => {
    try {
      const success = await projectStorageService.deleteProject(args.projectId);
      return { success };
    } catch (error) {
      outputChannel.appendLine(`Error in rooplus.api.deleteProject: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
);
```

### Phase 2: Watcher API Commands

Similar to the project commands, we can implement watcher API commands:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('rooplus.api.createWatcher', async (watcherData: {
    projectId: string,
    name: string,
    directoryPath: string,
    fileTypes: string[],
    prompt: string,
    mode: string
  }) => {
    try {
      // Need to get modeDisplayName like with schedules
      const availableModes = getAllModes(await customModesManager.getCustomModes());
      const modeConfig = availableModes.find(m => m.slug === watcherData.mode);
      
      const fullWatcherData = {
        ...watcherData,
        modeDisplayName: modeConfig?.name || watcherData.mode,
        active: true
      };
      
      const watcher = await watcherService.addWatcher(fullWatcherData);
      return { success: true, watcher };
    } catch (error) {
      outputChannel.appendLine(`Error in rooplus.api.createWatcher: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  })
);
```

### Phase 3: Document the API

Finally, we'll need to create documentation for other extensions (like Roo Code) to use these APIs. The documentation should include:

- Available commands
- Parameter structures
- Return types
- Error handling
- Usage examples

## Benefits of This Approach

1. **Simplicity**: Commands are already part of the VS Code extension API and are well-understood
2. **Discoverability**: Commands can be discovered through VS Code's command palette
3. **Asynchronous**: Commands can return promises, making them suitable for async operations
4. **Security**: VS Code handles extension permissions
5. **Reuse**: We can leverage the existing command patterns already in the codebase

## Next Steps

1. Implement the Project API commands in Roo+'s `extension.ts`
2. Implement the Watcher API commands
3. Test the commands from Roo Code
4. Document the API for future use

This approach should be significantly simpler than trying to get the MCP server working, as it uses VS Code's built-in extension communication mechanisms.
