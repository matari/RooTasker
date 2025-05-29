import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspacePath } from '../../utils/path';
import { fileExistsAtPath } from '../../utils/fs';
import { RooService } from '../scheduler/RooService'; 
import { Watcher, WatchersFile } from '../../../webview-ui/src/components/watchers/types'; 
import { ProjectStorageService } from '../../core/storage/ProjectStorageService'; 
import { BaseWatcher } from '../../shared/ProjectTypes'; 
import { PromptStorageService } from '../../core/storage/PromptStorageService'; // Added for prompt fetching
import { getAllModes } from '../../shared/modes'; // For modeDisplayName
import { CustomModesManager } from '../../core/config/CustomModesManager'; // For custom modes

export class WatcherService {
	private static instance: WatcherService;
  // private watchers: Watcher[] = []; // Will load from ProjectStorageService
  // private watchersFilePath: string; // Obsolete if watchers are project-based
  private outputChannel: vscode.OutputChannel;
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private promptStorageService: PromptStorageService;
  private projectStorageService: ProjectStorageService; // Added

  private constructor(private context: vscode.ExtensionContext) {
    // this.watchersFilePath = path.join(getWorkspacePath(), '.rootasker', 'watchers.json'); // Obsolete
    this.outputChannel = vscode.window.createOutputChannel('RooTasker Watchers');
    this.promptStorageService = new PromptStorageService(context);
    this.projectStorageService = new ProjectStorageService(context); // Initialize ProjectStorageService
    context.subscriptions.push(this.outputChannel);
  }

  public static getInstance(context: vscode.ExtensionContext): WatcherService {
    if (!WatcherService.instance) {
      WatcherService.instance = new WatcherService(context);
    }
    return WatcherService.instance;
  }

  public async initialize(): Promise<void> {
    this.log('Initializing WatcherService...');
    // Load watchers from all projects and set them up
    await this.reloadAndSetupAllWatchers();
  }

  // This method is now primarily for webview -> extension calls,
  // actual storage is handled by ProjectStorageService.
  // It ensures WatcherService's internal state (if any) and file system watchers are updated.
  public async addWatcher(
    projectId: string, 
    // This type should align with what webviewMessageHandler sends, which can include modeDisplayName
    watcherData: Omit<BaseWatcher, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> 
  ): Promise<BaseWatcher | undefined> {
    this.log(`WatcherService: addWatcher called for project ${projectId} with data: ${JSON.stringify(watcherData)}`);
    
    let enrichedWatcherData = { ...watcherData };

    // Ensure modeDisplayName is correctly set
    if (watcherData.mode && !watcherData.modeDisplayName) {
      // Need CustomModesManager to get all modes including custom ones
      // This assumes WatcherService has access or can get an instance.
      // For simplicity, if CustomModesManager is not directly injectable here,
      // we might need to pass it or have a static way to get modes.
      // Let's assume we can get it from context for now, or use a shared utility.
      // Re-creating CustomModesManager here just to get modes is not ideal.
      // Let's import getAllModes and CustomModesManager to do it properly.
      const customModesManager = new CustomModesManager(this.context, async () => {}); // Temp instance for getting modes
      const availableModes = getAllModes(await customModesManager.getCustomModes());
      const modeConfig = availableModes.find(m => m.slug === watcherData.mode);
      if (modeConfig && modeConfig.name) {
        enrichedWatcherData.modeDisplayName = modeConfig.name;
      } else {
        enrichedWatcherData.modeDisplayName = watcherData.mode; // Fallback to slug
        this.log(`Warning: modeDisplayName for mode "${watcherData.mode}" not found. Defaulting to slug.`);
      }
    }

    const newWatcher = await this.projectStorageService.addWatcherToProject(projectId, enrichedWatcherData);
    if (newWatcher) {
      this.log(`Watcher added to storage: "${newWatcher.name}", ID: ${newWatcher.id}, Mode: ${newWatcher.mode}, DisplayName: ${newWatcher.modeDisplayName}`);
      if (newWatcher.active) {
        this.setupFileWatcher(newWatcher as Watcher); // Cast for now, ensure compatibility
      }
      // Notify webview if needed (though postStateToWebview in handler might cover it)
      // vscode.commands.executeCommand('rootasker.watchersUpdated');
    }
    return newWatcher;
  }


  public async reloadAndSetupAllWatchers(): Promise<void> {
    this.log('Reloading and setting up all watchers...');
    const allProjects = await this.projectStorageService.getProjects();
    let allWatchers: BaseWatcher[] = [];

    for (const project of allProjects) {
      const projectWatchers = await this.projectStorageService.getWatchersForProject(project.id);
      allWatchers = allWatchers.concat(projectWatchers);
    }
    
    this.log(`Loaded ${allWatchers.length} watchers from ProjectStorageService.`);
    
    // Clear existing file watchers
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers.clear();

    // Setup new watchers
    allWatchers.forEach(watcher => {
      if (watcher.active) {
        // The Watcher type from UI and BaseWatcher from shared types might differ slightly.
        // Ensure setupFileWatcher can handle BaseWatcher or adapt the type.
        // For now, assuming BaseWatcher is compatible enough or casting.
        this.setupFileWatcher(watcher as Watcher); // Cast for now, ensure compatibility
      }
    });
    this.log('Finished setting up all file watchers.');
  }

  // Methods like addWatcher, duplicateWatcher, updateWatcher, deleteWatcher, toggleWatcherActive
  // will now primarily interact with ProjectStorageService and then call reloadAndSetupAllWatchers
  // or a more targeted update if possible.
  // For simplicity, a full reload might be acceptable for now.

  // Example: updateWatcher needs to persist to ProjectStorageService
  public async updateWatcher(watcherId: string, updates: Partial<Omit<BaseWatcher, 'id' | 'createdAt' | 'projectId'>>, projectId?: string): Promise<BaseWatcher | undefined> {
    const targetProjectId = projectId || (await this.findWatcherProjectId(watcherId));
    if (!targetProjectId) {
        this.log(`Cannot update watcher ${watcherId}: Project ID not found or provided.`);
        return undefined;
    }
    
    const watchers = await this.projectStorageService.getWatchersForProject(targetProjectId);
    const watcherIndex = watchers.findIndex(w => w.id === watcherId);

    if (watcherIndex === -1) {
      this.log(`Watcher with ID ${watcherId} not found in project ${targetProjectId} for update.`);
      return undefined;
    }
    const oldWatcher = watchers[watcherIndex];
    let updatedWatcherData = { 
        ...oldWatcher, 
        ...updates, 
        updatedAt: new Date().toISOString() 
    };

    // If mode is being updated, also update modeDisplayName
    if (updates.mode && updates.mode !== oldWatcher.mode) {
      const customModesManager = new CustomModesManager(this.context, async () => {}); // Temp instance
      const availableModes = getAllModes(await customModesManager.getCustomModes());
      const modeConfig = availableModes.find(m => m.slug === updates.mode);
      if (modeConfig && modeConfig.name) {
        updatedWatcherData.modeDisplayName = modeConfig.name;
      } else {
        updatedWatcherData.modeDisplayName = updates.mode; // Fallback to slug
        this.log(`Warning: modeDisplayName for new mode "${updates.mode}" not found during update. Defaulting to slug.`);
      }
    }
    
    this.log(`WatcherService.updateWatcher: Attempting to save updatedWatcherData: ${JSON.stringify(updatedWatcherData)} for watcher ID ${watcherId} in project ${targetProjectId}`);
    const savedWatcher = await this.projectStorageService.updateWatcherInProject(targetProjectId, updatedWatcherData);
    
    if (savedWatcher) {
        this.log(`Updated watcher: "${savedWatcher.name}" in project ${targetProjectId}`);
        // If active state changed or path/fileTypes changed, reset the specific watcher
        if (oldWatcher.active !== savedWatcher.active || oldWatcher.directoryPath !== savedWatcher.directoryPath || JSON.stringify(oldWatcher.fileTypes) !== JSON.stringify(savedWatcher.fileTypes)) {
            this.removeFileWatcher(watcherId);
            if (savedWatcher.active) {
                this.setupFileWatcher(savedWatcher as Watcher); // Cast for now
            }
        }
    }
    return savedWatcher;
  }
  
  private async findWatcherProjectId(watcherId: string): Promise<string | undefined> {
    const allProjects = await this.projectStorageService.getProjects();
    for (const project of allProjects) {
        const watchers = await this.projectStorageService.getWatchersForProject(project.id);
        if (watchers.some(w => w.id === watcherId)) {
            return project.id;
        }
    }
    return undefined;
  }

  // deleteWatcher and toggleWatcherActive would similarly use ProjectStorageService
  // and then potentially call reloadAndSetupAllWatchers or a targeted update.

  public async duplicateWatcher(watcherId: string, projectId?: string): Promise<BaseWatcher | undefined> {
    const targetProjectId = projectId || (await this.findWatcherProjectId(watcherId));
    if (!targetProjectId) {
      this.log(`Cannot duplicate watcher ${watcherId}: Project ID not found or provided.`);
      return undefined;
    }
    const watchers = await this.projectStorageService.getWatchersForProject(targetProjectId);
    const sourceWatcher = watchers.find(w => w.id === watcherId);

    if (!sourceWatcher) {
      this.log(`Watcher with ID ${watcherId} not found in project ${targetProjectId} for duplication.`);
      return undefined;
    }

    const { id, createdAt, updatedAt, lastTriggeredTime, lastTaskId, ...duplicableData } = sourceWatcher;
    
    const newWatcherData: Omit<BaseWatcher, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> = {
      ...duplicableData,
      name: `${sourceWatcher.name} - Copy`,
      active: false, // Start as inactive by default
    };

    const duplicatedWatcher = await this.projectStorageService.addWatcherToProject(targetProjectId, newWatcherData);

    if (duplicatedWatcher) {
      this.log(`Duplicated watcher "${sourceWatcher.name}" to "${duplicatedWatcher.name}" in project ${targetProjectId}`);
      // Duplicated watchers are set to inactive by default, so setupFileWatcher won't run unless explicitly activated later.
      // If it were active, we'd call:
      // if (duplicatedWatcher.active) {
      //   this.setupFileWatcher(duplicatedWatcher as Watcher);
      // }
      // For now, no explicit setup is needed here as they start inactive.
      // If the behavior changes for duplicated watchers to be active by default, this would need adjustment.
    }
    return duplicatedWatcher;
  }
  
  public async deleteWatcher(watcherId: string, projectId?: string): Promise<boolean> {
    const targetProjectId = projectId || (await this.findWatcherProjectId(watcherId));
    if (!targetProjectId) {
      this.log(`Cannot delete watcher ${watcherId}: Project ID not found or provided.`);
      return false;
    }
    const success = await this.projectStorageService.deleteWatcherFromProject(targetProjectId, watcherId);
    if (success) {
      this.log(`Deleted watcher ${watcherId} from project ${targetProjectId} in storage.`);
      this.removeFileWatcher(watcherId); // Remove active file system watcher
      // No need to call reloadAndSetupAllWatchers if removeFileWatcher is efficient
    }
    return success;
  }

  public async toggleWatcherActive(watcherId: string, active: boolean, projectId?: string): Promise<BaseWatcher | undefined> {
    const targetProjectId = projectId || (await this.findWatcherProjectId(watcherId));
    if (!targetProjectId) {
      this.log(`Cannot toggle watcher ${watcherId}: Project ID not found or provided.`);
      return undefined;
    }
    
    const watchers = await this.projectStorageService.getWatchersForProject(targetProjectId);
    const watcherToUpdate = watchers.find(w => w.id === watcherId);

    if (!watcherToUpdate) {
      this.log(`Watcher ${watcherId} not found in project ${targetProjectId} for toggle.`);
      return undefined;
    }
    if (watcherToUpdate.active === active) {
      this.log(`Watcher "${watcherToUpdate.name}" is already ${active ? 'active' : 'inactive'}.`);
      return watcherToUpdate;
    }

    const updatedWatcherData = { ...watcherToUpdate, active };
    const savedWatcher = await this.projectStorageService.updateWatcherInProject(targetProjectId, updatedWatcherData);

    if (savedWatcher) {
      this.removeFileWatcher(watcherId);
      if (savedWatcher.active) {
        this.setupFileWatcher(savedWatcher as Watcher); // Cast for now
      }
      this.log(`Toggled watcher "${savedWatcher.name}" to ${active ? 'active' : 'inactive'}.`);
    }
    return savedWatcher;
  }

  // This method remains largely the same but operates on BaseWatcher
  private setupFileWatcher(watcher: BaseWatcher): void { // Changed type to BaseWatcher
    if (!watcher.active || !watcher.directoryPath || watcher.fileTypes.length === 0) {
      return;
    }
    if (this.fileWatchers.has(watcher.id)) {
        this.removeFileWatcher(watcher.id); // Remove existing if any
    }

    // Create a glob pattern. For multiple fileTypes, VS Code watcher might need separate watchers or a complex glob.
    // For simplicity, we'll join them if it's simple extensions, or use the first if it's a glob.
    // A more robust solution might involve creating multiple watchers if `fileTypes` contains multiple distinct globs.
    const globPattern = watcher.fileTypes.map(ft => path.join(watcher.directoryPath, ft)).join(','); 
    // Example: if fileTypes is ["*.ts", "*.js"], globPattern becomes "{/path/to/dir/*.ts,/path/to/dir/*.js}"
    // vscode.workspace.createFileSystemWatcher expects a single glob string.
    // A common way is to use a pattern like `**/${watcher.fileTypes.join(',')}` if fileTypes are simple extensions.
    // Or if fileTypes are already globs like `*.txt`, then `path.join(watcher.directoryPath, watcher.fileTypes[0])`
    // For now, let's assume fileTypes are like `*.ts` or `data.json`.
    // We'll create one watcher per fileType entry for simplicity and robustness.

    watcher.fileTypes.forEach(fileTypePattern => {
        const singleGlob = path.join(watcher.directoryPath, fileTypePattern);
        const fsWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watcher.directoryPath, fileTypePattern));
        this.log(`Setting up watcher for "${watcher.name}" on pattern: ${singleGlob}`);

        const handleChange = async (uri: vscode.Uri) => {
          this.log(`File change detected for watcher "${watcher.name}" (Project ID: ${watcher.projectId}): ${uri.fsPath}`);
          
          // Check for internal command mode
          if (watcher.mode === 'internal-command' && watcher.prompt.startsWith('INTERNAL_COMMAND:PROCESS_IMPROVED_PROMPT:')) {
            this.log(`Internal command watcher triggered for: ${uri.fsPath}`);
            try {
              await vscode.commands.executeCommand('rootasker._internal.processImprovedPrompt', { filePath: uri.fsPath });
              // No need to update lastTriggeredTime or lastTaskId for internal system watchers like this.
            } catch (cmdError) {
              this.log(`Error executing internal command for watcher "${watcher.name}": ${cmdError instanceof Error ? cmdError.message : String(cmdError)}`);
            }
            return; // Stop further processing for this internal command
          }

        	try {
        		const projectStorageService = new ProjectStorageService(this.context);
        		const project = await projectStorageService.getProject(watcher.projectId);
      
        		if (!project || !project.directoryPath) {
        			this.log(`Project or project directory not found for watcher "${watcher.name}". Cannot provide full context.`);
        			
              let taskPrompt = watcher.prompt;
              if (watcher.promptSelectionType === 'saved' && watcher.savedPromptId) {
                const savedPrompt = await this.promptStorageService.getPrompt(watcher.savedPromptId);
                if (savedPrompt && savedPrompt.content) {
                  taskPrompt = savedPrompt.content;
                } else {
                  this.log(`Error: Saved prompt ID ${watcher.savedPromptId} not found or no content for watcher "${watcher.name}". Using original prompt.`);
                }
              }
        			const taskId = await RooService.startTaskWithMode(watcher.mode, taskPrompt);
        			this.log(`Triggered task ${taskId} for watcher "${watcher.name}" (no full project context) due to change in ${uri.fsPath}`);
        			const now = new Date().toISOString();
        			await this.updateWatcher(watcher.id, { lastTriggeredTime: now, lastTaskId: taskId });
        			return;
        		}
      
        		const projectWatchers: BaseWatcher[] = await projectStorageService.getWatchersForProject(watcher.projectId);
        		
        		const projectInfo = {
        			directoryPath: project.directoryPath,
        			watchedDirectories: projectWatchers.map(pw => ({
        				path: pw.directoryPath,
        				fileTypes: pw.fileTypes
        			}))
        		};
            
            let taskPrompt = watcher.prompt;
            if (watcher.promptSelectionType === 'saved' && watcher.savedPromptId) {
              const savedPrompt = await this.promptStorageService.getPrompt(watcher.savedPromptId);
              if (savedPrompt && savedPrompt.content) {
                taskPrompt = savedPrompt.content;
              } else {
                this.log(`Error: Saved prompt ID ${watcher.savedPromptId} not found or no content for watcher "${watcher.name}". Using original prompt.`);
              }
            }
      
        		const taskId = await RooService.startTaskWithMode(watcher.mode, taskPrompt, projectInfo);
        		this.log(`Triggered task ${taskId} for watcher "${watcher.name}" (Project: ${project.name}) with full context, due to change in ${uri.fsPath}`);
        		const now = new Date().toISOString();
        		await this.updateWatcher(watcher.id, { lastTriggeredTime: now, lastTaskId: taskId });
      
        	} catch (error) {
        		this.log(`Error triggering task for watcher "${watcher.name}": ${error instanceof Error ? error.message : String(error)}`);
        	}
        };

        fsWatcher.onDidChange(handleChange);
        fsWatcher.onDidCreate(handleChange);
        // fsWatcher.onDidDelete(uri => { /* Decide if delete should trigger */ });

        this.context.subscriptions.push(fsWatcher);
        // Store watcher with a compound key if multiple watchers per Watcher object
        this.fileWatchers.set(`${watcher.id}-${fileTypePattern}`, fsWatcher);
    });
  }

  private removeFileWatcher(watcherId: string): void {
    // Iterate over map entries to find all watchers associated with this watcherId
    for (const [key, fsWatcher] of this.fileWatchers.entries()) {
        if (key.startsWith(watcherId + "-")) {
            fsWatcher.dispose();
            this.fileWatchers.delete(key);
            this.log(`Removed file watcher for ID part: ${key}`);
        }
    }
  }

  public dispose(): void {
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers.clear();
    this.log('WatcherService disposed, all file watchers stopped.');
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
