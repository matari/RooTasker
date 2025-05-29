# Project Context Windows for Scheduled Tasks

## Overview

Currently, when scheduled tasks run for a specific project, they execute in the context of the current VS Code window, regardless of which directory is open. This can cause issues with project-specific tasks that need to run in the project's directory context.

After evaluation, we've identified two main approaches to solve this problem:

1. **Project Path in System Message (Recommended)**: A simple approach where the project path is included in the system message when triggering tasks, allowing the AI to be aware of the correct directory context.

2. **New VS Code Window Approach**: A more complex approach that launches tasks in a new VS Code window with the project's directory as the workspace.

This implementation plan outlines both approaches, with a focus on the simpler, recommended solution.

## Current Implementation Analysis

The `SchedulerService` and `RooService` currently work as follows:

1. `SchedulerService.runProjectSchedule` (or `runScheduleNow`) calls `processTask`
2. `processTask` calls `RooService.startTaskWithMode(mode, taskInstructions)`
3. `RooService.startTaskWithMode` uses the Roo Cline API to start a new task in the current VS Code window

The `startNewTask` method in the Roo Cline API does have a `newTab` parameter, but it doesn't include a way to specify a workspace or directory for the task.

## Proposed Solution 1: Project Path in System Message (Recommended)

### Overview

This simpler approach involves:
1. Adding the project path to the system message when tasks are triggered
2. Having all projects in a centralized location (or at least tracking their paths)
3. Allowing the AI to use the provided path information to correctly reference project files

### Implementation Steps

#### 1. Enhance the task instructions with project and watcher paths

Modify the `processTask` method in `SchedulerService` to include both project directory and watched directories in the task instructions:

```typescript
private async processTask(
  mode: string,
  taskInstructions: string,
  projectInfo?: {
    directoryPath: string,
    watchedDirectories?: { path: string, fileTypes: string[] }[]
  }
): Promise<string> {
  console.log('in process task', mode, taskInstructions);
  try {
    let enhancedInstructions = taskInstructions;
    
    if (projectInfo) {
      // Build context information section
      let contextInfo = `Project Directory: ${projectInfo.directoryPath}\n\n`;
      
      // Add watched directories if available
      if (projectInfo.watchedDirectories && projectInfo.watchedDirectories.length > 0) {
        contextInfo += "Watched Directories:\n";
        projectInfo.watchedDirectories.forEach((dir, index) => {
          contextInfo += `${index + 1}. ${dir.path} (File Types: ${dir.fileTypes.join(', ')})\n`;
        });
        contextInfo += "\n";
      }
      
      contextInfo += "Please use these paths for context when handling file operations.\n\n";
      
      // Add to task instructions
      enhancedInstructions = contextInfo + taskInstructions;
    }
    
    const taskId = await RooService.startTaskWithMode(mode, enhancedInstructions);
    console.log(`Successfully started task with mode "${mode}", taskId: ${taskId}`);
    return taskId;
  } catch (error) {
    console.log(`Error processing task: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
```

#### 2. Modify the `runProjectSchedule` method to include project and watcher paths:

```typescript
public async runProjectSchedule(schedule: BaseSchedule): Promise<void> {
  this.log(`Running project schedule: "${schedule.name}" (ID: ${schedule.id}) from project ID ${schedule.projectId}`);
  try {
    // Get project and watcher information
    const projectStorageService = new ProjectStorageService(this.context);
    const project = await projectStorageService.getProject(schedule.projectId);
    
    if (!project || !project.directoryPath) {
      throw new Error(`Could not find project or project path for ID: ${schedule.projectId}`);
    }
    
    // Get watchers for this project
    const projectWatchers = await projectStorageService.getWatchersForProject(schedule.projectId);
    
    // Prepare project info object with directory and watchers
    const projectInfo = {
      directoryPath: project.directoryPath,
      watchedDirectories: projectWatchers.map(watcher => ({
        path: watcher.directoryPath,
        fileTypes: watcher.fileTypes
      }))
    };
    
    // Call processTask with the project info
    const taskId = await this.processTask(schedule.mode, schedule.taskInstructions, projectInfo);
    
    this.log(`"Run Now" for project schedule "${schedule.name}" (Project: ${schedule.projectId}) started task ${taskId}.`);
    vscode.window.showInformationMessage(`Task "${schedule.name}" (from project) started manually.`);
    
  } catch (error) {
    this.log(`Error during "Run Now" for project schedule "${schedule.name}" (Project: ${schedule.projectId}): ${error instanceof Error ? error.message : String(error)}`);
    vscode.window.showErrorMessage(`Failed to run task "${schedule.name}" (from project) manually: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

#### 3. Add a method to `ProjectStorageService` to retrieve watchers for a project:

```typescript
/**
 * Gets the watchers associated with a project
 * @param projectId The ID of the project
 * @returns Promise<BaseWatcher[]> Array of watchers for the project
 */
public async getWatchersForProject(projectId: string): Promise<BaseWatcher[]> {
  const projectWatchers = await this.getAllWatchers();
  return projectWatchers.filter(watcher => watcher.projectId === projectId);
}
```

### Benefits of this Approach

1. **Complete Context**: The AI model receives both the project directory and all watched directories
2. **File Type Awareness**: Including file types for watched directories helps the AI understand what's important
3. **Simplicity**: Still significantly simpler to implement than opening new windows
4. **No Window Management**: Avoids issues with managing multiple VS Code windows
5. **No Race Conditions**: Eliminates timing issues between window creation and task execution
6. **Reliable**: The AI model will receive the complete project context directly
7. **Performance**: No overhead of creating new VS Code windows

### Example Prompt Enhancement

When a task is run, the system message at the beginning of the prompt might include:

```
Project Directory: C:/Users/user/Projects/MyProject

Watched Directories:
1. C:/Users/user/Projects/MyProject/src (File Types: ts, tsx, js, jsx)
2. C:/Users/user/Documents/Reference/API-Specs (File Types: json, yaml)
3. C:/OtherLocation/SharedLibrary (File Types: ts, js)

Please use these paths for context when handling file operations.

[Original task instructions follow here...]
```

This gives the AI a clear understanding of the project structure, including both the main project directory and any additional directories being watched, along with the file types of interest in each location.

## Proposed Solution 2: New VS Code Window Approach

We'll extend the system to:
1. Retrieve the project's workspace path
2. Open a new VS Code window with that path as the workspace
3. Start the task in that new window

### Implementation Steps

#### 1. Enhance `ProjectStorageService` to access project workspace paths

First, we need to examine how project paths are currently stored. Looking at the `Project` interface in `src/shared/ProjectTypes.ts`, we need to ensure it includes a `workspacePath` or similar field. If it doesn't, we'll need to extend the interface.

Then, create a new method in `ProjectStorageService` to get a project's directory path:

```typescript
/**
 * Gets the workspace directory path for a project
 * @param projectId The ID of the project
 * @returns Promise<string | undefined> The workspace path if found
 */
public async getProjectDirectoryPath(projectId: string): Promise<string | undefined> {
  const project = await this.getProject(projectId);
  if (!project || !project.workspacePath) {
    return undefined;
  }
  return project.workspacePath;
}
```

If the `Project` type doesn't currently store workspace paths, we'll need to implement logic to:
1. Store this information when projects are created
2. Add a migration for existing projects
3. Update the UI to allow setting/viewing workspace paths

#### 2. Modify the `runProjectSchedule` method in `SchedulerService` to open a new window

```typescript
public async runProjectSchedule(schedule: BaseSchedule): Promise<void> {
  this.log(`Running project schedule: "${schedule.name}" (ID: ${schedule.id}) from project ID ${schedule.projectId}`);
  try {
    // Get project workspace path
    const projectStorageService = new ProjectStorageService(this.context);
    const projectPath = await projectStorageService.getProjectDirectoryPath(schedule.projectId);
    
    if (!projectPath) {
      throw new Error(`Could not find workspace path for project ID: ${schedule.projectId}`);
    }
    
    // Open a new VS Code window with the project path
    const projectUri = vscode.Uri.file(projectPath);
    
    // Show notification before opening new window
    vscode.window.showInformationMessage(`Opening new window for task "${schedule.name}" in project directory: ${projectPath}`);
    
    // Open new window with the project directory
    await vscode.commands.executeCommand('vscode.openFolder', projectUri, true);
    
    // Give the new window a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the task in the new window
    // Note: This part is tricky because the current window loses focus
    // We have two options:
    
    // Option 1: Use the Roo Cline API from the new window context (challenging)
    // Option 2: Modify the Roo+ extension to accept parameters for deferred task execution on startup
    
    // For now, we'll use a temporary workaround by creating a special marker file in the project
    // directory that the extension will check on startup and execute the task if present
    const markerFilePath = path.join(projectPath, '.rooplus', 'pending-tasks.json');
    const pendingTask = {
      mode: schedule.mode,
      taskInstructions: schedule.taskInstructions,
      scheduleName: schedule.name,
      scheduleId: schedule.id,
      timestamp: new Date().toISOString()
    };
    
    // Ensure directory exists
    const markerDir = path.dirname(markerFilePath);
    if (!await fileExistsAtPath(markerDir)) {
      await fs.mkdir(markerDir, { recursive: true });
    }
    
    // Write the task data to the marker file
    await fs.writeFile(markerFilePath, JSON.stringify(pendingTask), 'utf-8');
    
    this.log(`Created pending task marker for "${schedule.name}" in ${markerFilePath}`);
    
  } catch (error) {
    this.log(`Error during "Run Now" for project schedule "${schedule.name}" (Project: ${schedule.projectId}): ${error instanceof Error ? error.message : String(error)}`);
    vscode.window.showErrorMessage(`Failed to run task "${schedule.name}" (from project) manually: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

#### 3. Add startup code to check for pending tasks in the Roo+ extension activation function

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ... existing activation code ...
  
  // Check for pending tasks
  await checkForPendingTasks(context);
  
  // ... rest of existing activation code ...
}

async function checkForPendingTasks(context: vscode.ExtensionContext): Promise<void> {
  try {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return; // No workspace open
    }
    
    const pendingTasksPath = path.join(workspacePath, '.rooplus', 'pending-tasks.json');
    if (!await fileExistsAtPath(pendingTasksPath)) {
      return; // No pending tasks
    }
    
    // Read and parse the pending task
    const content = await fs.readFile(pendingTasksPath, 'utf-8');
    const pendingTask = JSON.parse(content);
    
    // Validate the task data
    if (!pendingTask || !pendingTask.mode || !pendingTask.taskInstructions) {
      return;
    }
    
    console.log(`Found pending task for "${pendingTask.scheduleName}"`);
    
    // Delete the marker file first to prevent loops if there's an error
    await fs.unlink(pendingTasksPath);
    
    // Small delay to ensure extension is fully activated
    setTimeout(async () => {
      try {
        // Start the task
        const taskId = await RooService.startTaskWithMode(
          pendingTask.mode,
          pendingTask.taskInstructions
        );
        
        console.log(`Executed pending task "${pendingTask.scheduleName}" with ID ${taskId}`);
        vscode.window.showInformationMessage(`Starting scheduled task "${pendingTask.scheduleName}"...`);
      } catch (error) {
        console.error(`Error executing pending task: ${error instanceof Error ? error.message : String(error)}`);
        vscode.window.showErrorMessage(`Failed to start scheduled task: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 3000);
    
  } catch (error) {
    console.error(`Error checking for pending tasks: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

## Alternative Approaches

### 1. Using an Extension Command Protocol
Instead of a marker file, we could register a command in the extension that can be executed from the command line. Then use `vscode.commands.executeCommand` with the appropriate arguments to start VS Code with that command.

### 2. Using VS Code's Remote SSH Extension Approach
The VS Code Remote SSH extension uses a similar pattern where it creates a temporary script that sets up the environment and then launches VS Code configured to execute specific actions. We could adopt a similar approach.

### 3. Using Roo Cline API Extensions
Work with the Roo Cline team to extend their API to support specifying a workspace directory when starting a task.

## Implementation Considerations

1. **Race Conditions**: Ensure that the new window has enough time to initialize before expecting it to execute tasks.
2. **Error Handling**: Handle failures gracefully - e.g., if the project path doesn't exist or the new window fails to open.
3. **User Experience**: Provide clear notifications to the user about what's happening.
4. **Security**: Be careful with the marker file approach, as it could potentially be a vector for arbitrary code execution.
5. **Performance**: Consider the impact of opening a new VS Code window, especially on less powerful machines.

## Multi-Root Workspace Considerations

VS Code supports multi-root workspaces where multiple projects can be opened simultaneously. For this feature, we need to decide on the behavior when:

1. A task is scheduled for a project that's part of a multi-root workspace
2. The current window already has the target project open, either as a single folder or as part of a multi-root workspace

### Suggested Approach:

1. **Priority to Project Context**: Always open the specific project folder, not the entire multi-root workspace. This ensures the task runs with the correct context, even if it's more restricted than the multi-root workspace.

2. **Reuse Existing Windows**: If the project is already open in a VS Code window:
   - If it's the only folder in that window, reuse that window
   - If it's part of a multi-root workspace, still open a new window with just that project to ensure clean context

3. **User Configuration**: Add a setting to allow users to control this behavior:
   ```json
   {
     "rooplus.scheduler.openNewWindowForTasks": true,
     "rooplus.scheduler.reuseExistingWindows": false
   }
   ```

## Testing Plan

1. **Project Path Scenarios**:
   - Test with projects in standard locations
   - Test with projects in network drives
   - Test with projects containing spaces or special characters in paths
   - Test with nested project structures

2. **Task Types**:
   - Test with different modes (code, debug, architect, etc.)
   - Test with tasks that require workspace context
   - Test with tasks that don't need workspace context

3. **Error Handling**:
   - Missing project path
   - Invalid project path (non-existent directory)
   - Permission issues accessing project directory
   - Network path unavailable

4. **Concurrency**:
   - Multiple scheduled tasks firing simultaneously
   - Tasks from different projects
   - Tasks from the same project

5. **Multi-Root Workspace Scenarios**:
   - Project is part of a multi-root workspace
   - Multiple scheduled projects are in the same workspace

## Potential Enhancements for Future Versions

1. **Configuration Options**: Allow users to decide if they want tasks to open in a new window or run in the current context.
2. **Task Queue**: Implement a task queue system to handle multiple scheduled tasks without opening too many windows.
3. **Session Management**: Keep track of windows opened for scheduled tasks and reuse them when possible.
4. **Project Context Capture**: Capture more context from the original project (extensions, settings, etc.) to ensure a more consistent environment.
5. **Task Status Synchronization**: Keep task status synchronized between windows.
6. **Remote Development Support**: Ensure compatibility with VS Code's remote development features.
7. **Visual Indicators**: Add visual indicators in the UI to show which tasks are running in separate windows.

## Security Considerations

The proposed implementation introduces several security considerations that need to be addressed:

1. **Marker File Security**:
   - The marker file contains task instructions that will be executed automatically
   - A malicious actor with filesystem access could potentially place their own marker files
   - Need to implement validation and sanitization of the marker file contents
   - Consider adding a cryptographic signature to verify the file was created by our extension

2. **Path Traversal Protection**:
   - Ensure all path operations are sanitized to prevent directory traversal attacks
   - Validate that project paths are legitimate before opening them in new windows

3. **Permission Requirements**:
   - The extension will need permission to:
     - Create files in project directories
     - Open new VS Code windows
     - Execute commands in the new window context
   - These should be clearly documented for users

## Alternative Implementation Options

### VS Code API Approach

Instead of using marker files, investigate if VS Code's extension API provides more direct methods:

```typescript
// Alternative approach using VS Code extension commands
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Register a command that can be invoked with arguments
  const startTaskCommand = vscode.commands.registerCommand(
    'rooplus.startTaskInWindow',
    async (mode: string, taskInstructions: string, scheduleName: string) => {
      try {
        const taskId = await RooService.startTaskWithMode(mode, taskInstructions);
        vscode.window.showInformationMessage(`Starting scheduled task "${scheduleName}"...`);
      } catch (error) {
        console.error(`Error executing task: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  
  context.subscriptions.push(startTaskCommand);
}
```

Then use this command from the original window:

```typescript
// In the original window
const projectUri = vscode.Uri.file(projectPath);
await vscode.commands.executeCommand('vscode.openFolder', projectUri, true);

// Construct a command that will be run in the new window
// This requires constructing a proper URI command format
const commandUri = vscode.Uri.parse(
  `command:rooplus.startTaskInWindow?${encodeURIComponent(JSON.stringify([
    schedule.mode,
    schedule.taskInstructions,
    schedule.name
  ]))}`
);

// Execute the command in the new window
await vscode.env.openExternal(commandUri);
```

This approach would require careful URI encoding/decoding but potentially provide a cleaner solution than marker files.
