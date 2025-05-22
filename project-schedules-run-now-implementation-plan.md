# Project Schedules "Run Now" Implementation Plan

## Problem Statement

Currently, when a user clicks the "Run Now" button on a project-based schedule, the feature fails because:

1. The frontend (`SchedulerView.tsx`) only sends the `scheduleId` to the backend, without the `projectId`
2. The backend (`webviewMessageHandler.ts`) passes this `scheduleId` to the `SchedulerService.runScheduleNow` method
3. The `SchedulerService` looks for the schedule in the standalone schedules list (in `.rootasker/schedules.json`), not in the project schedules
4. Since project schedules use a different ID format and storage mechanism, the schedule is not found

## Solution Overview

We need to modify the system to properly handle "Run Now" for project schedules by ensuring the `projectId` is included in the message flow and the backend knows to look for the schedule in the project's context.

## Implementation Steps

### 1. Update the Frontend (`webview-ui/src/components/scheduler/SchedulerView.tsx`)

Modify the `onRunNowHandler` method to include the `projectId` when sending the message to the backend:

```typescript
const onRunNowHandler = (scheduleId: string) => {
  if (!activeProjectId) {
    console.error("Cannot run schedule: No active project selected.");
    return;
  }
  vscode.postMessage({
    type: "runScheduleNow",
    scheduleId: scheduleId,
    projectId: activeProjectId,
  });
};
```

### 2. Update the Backend Message Handler (`src/core/webview/webviewMessageHandler.ts`)

Modify the "runScheduleNow" case in the `webviewMessageHandler` to check for a `projectId` and handle project schedules differently:

```typescript
case "runScheduleNow": {
  if (message.scheduleId) {
    try {
      if (message.projectId) {
        // This is a project schedule
        console.log(`Running project schedule: ${message.scheduleId} in project ${message.projectId}`);
        
        // Get the project's schedules from ProjectStorageService
        const projectSchedules = await provider.projectStorageService.getSchedulesForProject(message.projectId);
        const scheduleToRun = projectSchedules.find(s => s.id === message.scheduleId);
        
        if (scheduleToRun) {
          // Import SchedulerService for running the schedule
          const { SchedulerService } = await import("../../services/scheduler/SchedulerService");
          const schedulerService = SchedulerService.getInstance(provider.contextProxy.extensionContext);
          
          // Run the schedule with mode and taskInstructions
          await schedulerService.processTask(scheduleToRun.mode, scheduleToRun.taskInstructions);
          
          provider.log(`Successfully triggered "Run Now" for project schedule ID: ${message.scheduleId} in project: ${message.projectId}`);
        } else {
          throw new Error(`Schedule with ID ${message.scheduleId} not found in project ${message.projectId}`);
        }
      } else {
        // This is a standalone schedule
        const { SchedulerService } = await import("../../services/scheduler/SchedulerService");
        const schedulerService = SchedulerService.getInstance(provider.contextProxy.extensionContext);
        await schedulerService.runScheduleNow(message.scheduleId);
        provider.log(`Successfully triggered "Run Now" for standalone schedule ID: ${message.scheduleId}`);
      }
    } catch (error) {
      provider.log(`Error running schedule now: ${error instanceof Error ? error.message : String(error)}`);
      vscode.window.showErrorMessage(`Failed to run schedule: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    provider.log("runScheduleNow: Missing scheduleId in message");
  }
  break;
}
```

### 3. Add a Method to Access Project Schedules in `SchedulerService`

If the `processTask` method is not directly accessible, we may need to add a new method to the `SchedulerService` class:

```typescript
// Add to src/services/scheduler/SchedulerService.ts

public async runProjectSchedule(schedule: BaseSchedule): Promise<void> {
  this.log(`Running project schedule: "${schedule.name}" (ID: ${schedule.id})`);
  try {
    // We call processTask directly to execute the schedule
    const taskId = await this.processTask(schedule.mode, schedule.taskInstructions);
    this.log(`"Run Now" for project schedule "${schedule.name}" started task ${taskId}.`);
    vscode.window.showInformationMessage(`Task "${schedule.name}" started manually.`);
  } catch (error) {
    this.log(`Error during "Run Now" for project schedule "${schedule.name}": ${error instanceof Error ? error.message : String(error)}`);
    vscode.window.showErrorMessage(`Failed to run task "${schedule.name}" manually: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

### 4. Verify Access to `ProjectStorageService` in the WebviewMessageHandler

Make sure `provider.projectStorageService` is properly accessible in the `webviewMessageHandler`. If not, you may need to:

1. Import the service:
   ```typescript
   import { ProjectStorageService } from "../../core/storage/ProjectStorageService";
   ```

2. Initialize it in the provider if it's not already initialized:
   ```typescript
   // In the provider initialization 
   this.projectStorageService = new ProjectStorageService(this.contextProxy.extensionContext);
   ```

## Testing Plan

1. Select a project with schedules
2. Click "Run Now" on a schedule
3. Verify that the task executes successfully without errors
4. Check logs to confirm the project schedule was correctly identified and executed

## Implementation Recommendations

These changes should be implemented in "Code" mode, which has permissions to edit the necessary files. The changes should be made in this order:

1. Update the frontend (`SchedulerView.tsx`)
2. Update the backend message handler (`webviewMessageHandler.ts`)
3. Add any necessary methods to `SchedulerService`
4. Test the changes