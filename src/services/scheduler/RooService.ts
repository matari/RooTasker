import * as vscode from 'vscode';
import { RooCodeAPI } from '../../roo-code';

/**
 * Service for interacting with the Roo Cline extension.
 */
export class RooService {
  /**
   * Starts a new task in the Roo Cline extension with the specified mode and instructions.
   * @param mode The mode slug to use.
   * @param taskInstructions The instructions for the task.
   * @throws Error if the Roo Cline extension or its API is not available.
   */
  /**
   * Starts a new task in the Roo Cline extension with the specified mode and instructions.
   * @param mode The mode slug to use.
   * @param taskInstructions The instructions for the task.
   * @param projectInfo Optional project context information.
   * @returns The ID of the new task.
   * @throws Error if the Roo Cline extension or its API is not available.
   */
  public static async startTaskWithMode(
  	mode: string,
  	taskInstructions: string,
  	projectInfo?: {
  		directoryPath: string,
  		watchedDirectories?: { path: string, fileTypes: string[] }[]
  	}
  ): Promise<string> {
  	const api = RooService.getRooClineApi();
  	console.log('got api', api);
  	// Get the current configuration
  	const config = api.getConfiguration();
  	console.log('got config', config);
 
  	// Set the mode in the configuration
  	const updatedConfig = {
  		...config,
  		mode,
  		customModePrompts: config.customModePrompts || {}
  	};
  	console.log(updatedConfig);
 
  	let finalTaskInstructions = taskInstructions;
  	if (projectInfo) {
  		let contextInfo = `Project Directory: ${projectInfo.directoryPath}\n\n`;
  		if (projectInfo.watchedDirectories && projectInfo.watchedDirectories.length > 0) {
  			contextInfo += "Watched Directories:\n";
  			projectInfo.watchedDirectories.forEach((dir, index) => {
  				contextInfo += `${index + 1}. ${dir.path} (File Types: ${dir.fileTypes.join(', ')})\n`;
  			});
  			contextInfo += "\n";
  		}
  		contextInfo += "Please use these paths for context when handling file operations.\n\n";
  		finalTaskInstructions = contextInfo + taskInstructions;
  	}
 
  	// Start a new task with the specified mode and instructions, and return the task ID
  	const taskId = await api.startNewTask({
  		configuration: updatedConfig,
  		text: finalTaskInstructions
  	});
  	console.log('got taskId', taskId);
  	return taskId;
  }

  /**
   * Gets the Roo Cline API instance, or throws if not available.
   * @private
   */
  private static getRooClineApi() {
    const extension = vscode.extensions.getExtension<RooCodeAPI>("rooveterinaryinc.roo-cline");
    if (!extension?.isActive) {
      throw new Error("Roo Cline extension is not activated");
    }
    const api = extension.exports;
    if (!api) {
      throw new Error("Roo Cline API is not available");
    }
    return api;
  }

  /**
   * Returns the task history array from the Roo Cline API configuration,
   * or undefined if there is no active task stack or no history.
   * @private
   */
  private static getTaskHistoryAndStack(): {taskHistory: any[], taskStack: string[]} {
    const api = RooService.getRooClineApi();
    const taskStack = api.getCurrentTaskStack();

    const config = api.getConfiguration();
    const taskHistory = config.taskHistory || [];
    
    return {taskHistory,taskStack};
  }

  /**
   * Gets the timestamp of the last activity on the active task.
   * @returns The timestamp (ms since epoch) of the last activity, or undefined if not found.
   */
  public static async getLastActivityTimeForActiveTask(): Promise<number | undefined> {
    const {taskStack, taskHistory} = this.getTaskHistoryAndStack();
    if (!taskStack || taskStack.length === 0) {
      return undefined;
    }
    const activeTaskId = taskStack[taskStack.length - 1];
   
    // Find the last entry for the active task (most recent message)
    const activeTaskEntries = taskHistory.filter((entry: any) => entry.id === activeTaskId);
    if (!activeTaskEntries.length) {
      return undefined;
    }
    return activeTaskEntries[activeTaskEntries.length - 1].ts;
  }

  /**
   * Gets the timestamp of the last activity, excluding a specific task if provided.
   * @returns The timestamp (ms since epoch) of the last activity, or undefined if not found.
   */
  public static async getLastActivityTime(excludedTaskId?: string): Promise<number | undefined> {
    let {taskHistory} = RooService.getTaskHistoryAndStack();
    if (!taskHistory) {
      return undefined;
    }
    if (excludedTaskId) {
      taskHistory = taskHistory.filter((entry: any) => entry.id !== excludedTaskId);
    }
    if (!taskHistory.length) {
      return undefined;
    }
    return taskHistory[taskHistory.length - 1].ts;
  }

  /**
   * Checks if there is an active task with activity within the given duration.
   * @param durationMs The duration in milliseconds.
   * @returns Promise<boolean> - true if there is an active task and its most recent activity is within the duration from now, otherwise false.
   */
  public static async isActiveTaskWithinDuration(durationMs: number): Promise<boolean> {
    const lastActivityTime = await RooService.getLastActivityTimeForActiveTask();
    if (!lastActivityTime) {
      return false;
    }
    const now = Date.now();
    return now - lastActivityTime <= durationMs;
  }

  /**
   * Checks if there is an active task running.
   * @returns Promise<boolean> - true if there is an active task, otherwise false.
   */
  public static async hasActiveTask(): Promise<boolean> {
    const api = RooService.getRooClineApi();
    const taskStack = api.getCurrentTaskStack();
    return !!taskStack && taskStack.length > 0;
  }

  /**
   * Interrupts the current active task, if any.
   * @returns Promise<boolean> - true if a task was interrupted, false if no active task.
   */
  public static async interruptActiveTask(): Promise<boolean> {
    const api = RooService.getRooClineApi();
    const taskStack = api.getCurrentTaskStack();
    
    if (!taskStack || taskStack.length === 0) {
      return false;
    }
    
    // Cancel the current task
    await api.cancelCurrentTask();
    return true;
  }
  
  /**
   * Resumes a task with the given ID and opens the Roo Cline extension.
   * @param taskId The ID of the task to resume.
   * @returns Promise<void>
   * @throws Error if the task is not found in the task history or the Roo Cline extension is not available.
   */
  public static async resumeTask(taskId: string): Promise<void> {
    console.log(`RooService.resumeTask called with taskId: ${taskId}`);
    
    if (!taskId) {
      console.error("Task ID is empty or undefined");
      throw new Error("Task ID is required to resume a task");
    }
  
    console.log("Getting Roo Cline API...");
    const api = RooService.getRooClineApi();
    console.log("Roo Cline API obtained successfully");
    
    try {
      // First, check if the task exists in history
      console.log("Checking if task exists in history...");
      const exists = await api.isTaskInHistory(taskId);
      if (!exists) {
        console.error(`Task with ID ${taskId} not found in history`);
        throw new Error(`Task with ID ${taskId} not found in history`);
      }
      console.log(`Task with ID ${taskId} found in history`);
      
      // Try different approaches to open the Roo Cline extension
      try {
        // First try the direct command
        console.log("Opening Roo Cline extension via direct command...");
        await vscode.commands.executeCommand("workbench.view.extension.roo-cline-ActivityBar");
      } catch (cmdError) {
        console.error("Error opening Roo Cline extension via direct command:", cmdError);
        
        // Try the registered command in our extension
        try {
          console.log("Opening Roo Cline extension via our registered command...");
          await vscode.commands.executeCommand("roo-scheduler.openRooClineExtension");
        } catch (regCmdError) {
          console.error("Error opening Roo Cline extension via registered command:", regCmdError);
          // Continue anyway, as the resumeTask might still work
        }
      }
      
      // Resume the task
      console.log(`Resuming task with ID: ${taskId}...`);
      await api.resumeTask(taskId);
      console.log("Task resumed successfully");
      
      // Show a notification to the user
      vscode.window.showInformationMessage(`Task ${taskId} resumed successfully`);
    } catch (error) {
      console.error("Error in resumeTask:", error);
      throw error;
    }
  }
}