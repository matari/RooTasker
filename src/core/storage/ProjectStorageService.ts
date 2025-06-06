import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, BaseSchedule, BaseWatcher } from '../../shared/ProjectTypes';
import { GlobalFileNames } from '../../shared/globalFileNames';

const PROJECTS_KEY = 'rooplus.projects';
// For individual project data, we might use keys like:
// `rooplus.project.${projectId}.schedules`
// `rooplus.project.${projectId}.watchers`

export class ProjectStorageService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // --- Project Methods ---

  async getProjects(): Promise<Project[]> {
    return this.context.globalState.get<Project[]>(PROJECTS_KEY) || [];
  }

  private async saveProjects(projects: Project[]): Promise<void> { // Made private
    await this.context.globalState.update(PROJECTS_KEY, projects);
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const projects = await this.getProjects();
    return projects.find(p => p.id === projectId);
  }

  async addProject(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const projects = await this.getProjects();
    const now = new Date().toISOString();
    const newProject: Project = {
      ...projectData, // projectData now includes watchInputDirEnabled
      id: `${vscode.env.machineId}-${Date.now().toString()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };
    projects.push(newProject);
    await this.saveProjects(projects);

    // Conditionally create a watcher if watchInputDirEnabled is true
    if (newProject.watchInputDirEnabled && newProject.directoryPath) {
      try {
        const { WatcherService } = await import('../../services/watchers/WatcherService');
        const watcherService = WatcherService.getInstance(this.context);
        const watcherName = `${newProject.name} Input`; // Default watcher name
        const inputDirPath = path.join(newProject.directoryPath, 'Input');

        // Ensure the Input directory exists
        try {
          await fs.mkdir(inputDirPath, { recursive: true });
          console.log(`Ensured "Input" directory exists at: ${inputDirPath}`);
        } catch (mkdirError) {
          console.error(`Failed to create "Input" directory at ${inputDirPath}:`, mkdirError);
          // Decide if we should proceed without the directory or throw/return
        }

        await watcherService.addWatcher(newProject.id, {
          name: watcherName,
          directoryPath: inputDirPath, // Watch the project's "Input" subdirectory
          fileTypes: ['*.*'], // Default: watch all file types
          prompt: '', // Default: empty prompt, user can edit
          promptSelectionType: 'custom',
          mode: 'code', // Default mode, can be changed by user
          active: true, // Start active by default
          // modeDisplayName will be populated by WatcherService.addWatcher
        });
        console.log(`Automatically created watcher "${watcherName}" for project "${newProject.name}".`);
      } catch (error) {
        console.error(`Failed to automatically create watcher for project "${newProject.name}":`, error);
        // Optionally, inform the user via a vscode.window.showWarningMessage
      }
    }

    return newProject;
  }

  async ensureSystemProjectExists(): Promise<Project> {
    const { GlobalFileNames } = await import('../../shared/globalFileNames');
    let projects = await this.getProjects();
    let systemProject = projects.find(p => p.id === GlobalFileNames.systemProjectId);

    if (!systemProject) {
      console.log("System project not found, creating one...");
      const now = new Date().toISOString();
      systemProject = {
        id: GlobalFileNames.systemProjectId,
        name: "Roo+ System",
        description: "Internal project for Roo+ system tasks. Not typically user-editable.",
        directoryPath: this.context.globalStorageUri.fsPath, // System project not tied to a user workspace
        color: "#555555", // A muted color
        createdAt: now,
        updatedAt: now,
      };
      projects.push(systemProject);
      await this.saveProjects(projects);
      console.log("System project created.");
    }
    return systemProject;
  }

  async updateProject(updatedProject: Project): Promise<Project | undefined> {
    const projects = await this.getProjects();
    const projectIndex = projects.findIndex(p => p.id === updatedProject.id);
    if (projectIndex === -1) {
      return undefined; // Project not found
    }
    const oldProject = projects[projectIndex];
    projects[projectIndex] = {
      ...updatedProject, // updatedProject now includes watchInputDirEnabled
      updatedAt: new Date().toISOString(),
    };
    await this.saveProjects(projects);

    // Handle watcher creation/deletion based on watchInputDirEnabled change
    // For simplicity, as per plan, we only create on initial add.
    // If requirements change to manage watcher on update, logic would go here.
    // Example: if oldProject.watchInputDirEnabled was false and updatedProject.watchInputDirEnabled is true, create watcher.
    // If oldProject.watchInputDirEnabled was true and updatedProject.watchInputDirEnabled is false, delete associated watcher.
    // This requires finding the specific watcher linked to this project's input dir.

    return projects[projectIndex];
  }

  async deleteProject(projectId: string): Promise<boolean> {
    if (projectId === GlobalFileNames.systemProjectId) {
      console.warn(`Attempted to delete system project (${projectId}). Operation denied.`);
      vscode.window.showWarningMessage("The Roo+ System project cannot be deleted.");
      return false;
    }
    let projects = await this.getProjects();
    const initialLength = projects.length;
    projects = projects.filter(p => p.id !== projectId);
    if (projects.length < initialLength) {
      await this.saveProjects(projects);
      // Also delete associated schedules and watchers
      await this.saveSchedulesForProject(projectId, []);
      await this.saveWatchersForProject(projectId, []);
      return true;
    }
    return false;
  }

  // --- Schedule Methods (per project) ---

  private getSchedulesKey(projectId: string): string {
    return `rooplus.project.${projectId}.schedules`;
  }

  async getSchedulesForProject(projectId: string): Promise<BaseSchedule[]> {
    const project = await this.getProject(projectId);
    if (!project) return []; // Or throw error
    return this.context.globalState.get<BaseSchedule[]>(this.getSchedulesKey(projectId)) || [];
  }

  async saveSchedulesForProject(projectId: string, schedules: BaseSchedule[]): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) return; // Or throw error
    await this.context.globalState.update(this.getSchedulesKey(projectId), schedules);
  }

  async addScheduleToProject(projectId: string, scheduleData: Omit<BaseSchedule, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>): Promise<BaseSchedule | undefined> {
    const project = await this.getProject(projectId);
    if (!project) return undefined;

    const schedules = await this.getSchedulesForProject(projectId);
    const now = new Date().toISOString();
    const newSchedule: BaseSchedule = {
      ...scheduleData,
      id: vscode.env.machineId + Date.now().toString(), // Simple unique ID
      projectId: projectId,
      createdAt: now,
      updatedAt: now,
    };
    schedules.push(newSchedule);
    await this.saveSchedulesForProject(projectId, schedules);
    return newSchedule;
  }

  async updateScheduleInProject(projectId: string, updatedSchedule: BaseSchedule): Promise<BaseSchedule | undefined> {
    const project = await this.getProject(projectId);
    if (!project || updatedSchedule.projectId !== projectId) return undefined;

    const schedules = await this.getSchedulesForProject(projectId);
    const scheduleIndex = schedules.findIndex(s => s.id === updatedSchedule.id);
    if (scheduleIndex === -1) {
      return undefined; // Schedule not found
    }
    schedules[scheduleIndex] = {
      ...updatedSchedule,
      updatedAt: new Date().toISOString(),
    };
    await this.saveSchedulesForProject(projectId, schedules);
    return schedules[scheduleIndex];
  }

  async deleteScheduleFromProject(projectId: string, scheduleId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    if (!project) return false;

    let schedules = await this.getSchedulesForProject(projectId);
    const initialLength = schedules.length;
    schedules = schedules.filter(s => s.id !== scheduleId);
    if (schedules.length < initialLength) {
      await this.saveSchedulesForProject(projectId, schedules);
      return true;
    }
    return false;
  }

  // --- Watcher Methods (per project) ---

  private getWatchersKey(projectId: string): string {
    return `rooplus.project.${projectId}.watchers`;
  }

  async getWatchersForProject(projectId: string): Promise<BaseWatcher[]> {
    const project = await this.getProject(projectId);
    if (!project) return []; // Or throw error
    return this.context.globalState.get<BaseWatcher[]>(this.getWatchersKey(projectId)) || [];
  }

  async saveWatchersForProject(projectId: string, watchers: BaseWatcher[]): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) return; // Or throw error
    await this.context.globalState.update(this.getWatchersKey(projectId), watchers);
  }

  async addWatcherToProject(projectId: string, watcherData: Omit<BaseWatcher, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>): Promise<BaseWatcher | undefined> {
    const project = await this.getProject(projectId);
    if (!project) return undefined;

    const watchers = await this.getWatchersForProject(projectId);
    const now = new Date().toISOString();

    let finalWatcherData = { ...watcherData };
    if (watcherData.mode && !watcherData.modeDisplayName) {
      // Attempt to populate modeDisplayName if not provided
      // This requires CustomModesManager, which isn't directly available here.
      // For now, we'll rely on the caller (WatcherService or API in extension.ts) to provide it.
      // If WatcherService needs to do this, it should be done there.
      // The API command in extension.ts already does this.
      // Let's assume watcherData from UI should ideally come with modeDisplayName.
      // As a fallback, we can set it to mode slug.
      finalWatcherData.modeDisplayName = watcherData.mode; 
      console.warn(`addWatcherToProject: modeDisplayName not provided for watcher "${watcherData.name}", defaulting to mode slug "${watcherData.mode}".`);
    }

    const newWatcher: BaseWatcher = {
      ...finalWatcherData,
      id: vscode.env.machineId + Date.now().toString(), // Simple unique ID
      projectId: projectId,
      createdAt: now,
      updatedAt: now,
    };
    watchers.push(newWatcher);
    await this.saveWatchersForProject(projectId, watchers);
    return newWatcher;
  }

  async updateWatcherInProject(projectId: string, updatedWatcher: BaseWatcher): Promise<BaseWatcher | undefined> {
    const project = await this.getProject(projectId);
    if (!project || updatedWatcher.projectId !== projectId) return undefined;

    const watchers = await this.getWatchersForProject(projectId);
    const watcherIndex = watchers.findIndex(w => w.id === updatedWatcher.id);
    if (watcherIndex === -1) {
      return undefined; // Watcher not found
    }
    watchers[watcherIndex] = {
      ...updatedWatcher,
      updatedAt: new Date().toISOString(),
    };
    await this.saveWatchersForProject(projectId, watchers);
    return watchers[watcherIndex];
  }

  async deleteWatcherFromProject(projectId: string, watcherId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    if (!project) return false;

    if (projectId === GlobalFileNames.systemProjectId) {
      const watcherToDelete = (await this.getWatchersForProject(projectId)).find(w => w.id === watcherId);
      // Names of system watchers defined in extension.ts
      const systemWatcherNames = ["Internal Prompt Improver Watcher", "Internal Prompt Processor Watcher"];
      if (watcherToDelete && systemWatcherNames.includes(watcherToDelete.name)) {
        console.warn(`Attempted to delete system watcher "${watcherToDelete.name}" (${watcherId}) from system project. Operation denied.`);
        vscode.window.showWarningMessage(`System watcher "${watcherToDelete.name}" cannot be deleted.`);
        return false;
      }
    }

    let watchers = await this.getWatchersForProject(projectId);
    const initialLength = watchers.length;
    watchers = watchers.filter(w => w.id !== watcherId);
    if (watchers.length < initialLength) {
      await this.saveWatchersForProject(projectId, watchers);
      return true;
    }
    return false;
  }

  // --- Migration Methods ---
  async migrateFromWorkspaceStorageIfNeeded(workspacePath: string | undefined): Promise<Project | undefined> {
    if (!workspacePath) {
      console.log('Migration check: No workspace path provided.');
      return undefined;
    }

    const migrationMarkerKey = `rooplus.migrated.${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const alreadyMigrated = this.context.globalState.get<boolean>(migrationMarkerKey);

    if (alreadyMigrated) {
      // console.log(`Migration already performed for workspace: ${workspacePath}`);
      return undefined;
    }

    console.log(`Checking for migration for workspace: ${workspacePath}`);

    const oldSchedulesPath = path.join(workspacePath, '.rooplus', 'schedules.json');
    const oldWatchersPath = path.join(workspacePath, '.rooplus', 'watchers.json');

    let oldSchedulesData: { schedules?: any[] } | null = null;
    let oldWatchersData: { watchers?: any[] } | null = null;
    let dataFoundToMigrate = false;

    try {
      const schedulesContent = await fs.readFile(oldSchedulesPath, 'utf-8');
      oldSchedulesData = JSON.parse(schedulesContent);
      if (oldSchedulesData?.schedules && oldSchedulesData.schedules.length > 0) {
        dataFoundToMigrate = true;
        console.log(`Found ${oldSchedulesData.schedules.length} schedules to migrate from ${oldSchedulesPath}`);
      }
    } catch (error) {
      // console.log(`No old schedules file found at ${oldSchedulesPath} or error reading it: ${error.message}`);
    }

    try {
      const watchersContent = await fs.readFile(oldWatchersPath, 'utf-8');
      oldWatchersData = JSON.parse(watchersContent);
      if (oldWatchersData?.watchers && oldWatchersData.watchers.length > 0) {
        dataFoundToMigrate = true;
        console.log(`Found ${oldWatchersData.watchers.length} watchers to migrate from ${oldWatchersPath}`);
      }
    } catch (error) {
      // console.log(`No old watchers file found at ${oldWatchersPath} or error reading it: ${error.message}`);
    }

    if (!dataFoundToMigrate) {
      console.log(`No data to migrate for workspace: ${workspacePath}. Marking as checked.`);
      await this.context.globalState.update(migrationMarkerKey, true);
      return undefined;
    }

    const workspaceFolderName = path.basename(workspacePath);
    const defaultProjectName = `Migrated - ${workspaceFolderName}`;
    
    const existingProjects = await this.getProjects();
    let targetProject = existingProjects.find(p => p.name === defaultProjectName && p.directoryPath === workspacePath);

    if (!targetProject) {
        console.log(`Creating new project for migrated data: ${defaultProjectName}`);
        try {
            targetProject = await this.addProject({
                name: defaultProjectName,
                description: `Schedules and watchers migrated from the workspace: ${workspacePath}`,
                directoryPath: workspacePath,
                color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
            });
        } catch (addProjectError) {
            console.error(`Failed to create project during migration for ${workspacePath}: ${addProjectError}`);
            return undefined; // Cannot proceed
        }
    } else {
        console.log(`Using existing project for migrated data: ${targetProject.name} (ID: ${targetProject.id})`);
    }
    
    const migratedSchedules: BaseSchedule[] = [];
    if (oldSchedulesData?.schedules) {
      for (const oldSchedule of oldSchedulesData.schedules) {
        const now = new Date().toISOString();
        migratedSchedules.push({
          id: oldSchedule.id || (vscode.env.machineId + Date.now().toString() + Math.random().toString(36).substring(2,7)),
          projectId: targetProject.id,
          name: oldSchedule.name || "Untitled Migrated Schedule",
          mode: oldSchedule.mode || "code",
          taskInstructions: oldSchedule.taskInstructions || "",
          scheduleKind: oldSchedule.scheduleKind || "interval",
          recurrenceType: oldSchedule.recurrenceType,
          recurrenceDay: oldSchedule.recurrenceDay,
          recurrenceMonth: oldSchedule.recurrenceMonth,
          cronExpression: oldSchedule.cronExpression,
          timeInterval: oldSchedule.timeInterval,
          timeUnit: oldSchedule.timeUnit,
          selectedDays: oldSchedule.selectedDays,
          startDate: oldSchedule.startDate,
          startHour: oldSchedule.startHour,
          startMinute: oldSchedule.startMinute,
          expirationDate: oldSchedule.expirationDate,
          expirationHour: oldSchedule.expirationHour,
          expirationMinute: oldSchedule.expirationMinute,
          maxExecutions: oldSchedule.maxExecutions,
          executionCount: oldSchedule.executionCount,
          requireActivity: oldSchedule.requireActivity,
          active: oldSchedule.active !== undefined ? oldSchedule.active : true,
          taskInteraction: oldSchedule.taskInteraction,
          inactivityDelay: oldSchedule.inactivityDelay,
          createdAt: oldSchedule.createdAt || now,
          updatedAt: now,
          lastExecutionTime: oldSchedule.lastExecutionTime,
          lastSkippedTime: oldSchedule.lastSkippedTime,
          lastTaskId: oldSchedule.lastTaskId,
          nextExecutionTime: oldSchedule.nextExecutionTime,
          modeDisplayName: oldSchedule.modeDisplayName,
        });
      }
      if (migratedSchedules.length > 0) {
        await this.saveSchedulesForProject(targetProject.id, migratedSchedules);
        console.log(`Migrated ${migratedSchedules.length} schedules to project ${targetProject.name}`);
      }
    }

    const migratedWatchers: BaseWatcher[] = [];
    if (oldWatchersData?.watchers) {
      for (const oldWatcher of oldWatchersData.watchers) {
        const now = new Date().toISOString();
        migratedWatchers.push({
          id: oldWatcher.id || (vscode.env.machineId + Date.now().toString() + Math.random().toString(36).substring(2,7)),
          projectId: targetProject.id,
          name: oldWatcher.name || "Untitled Migrated Watcher",
          directoryPath: oldWatcher.directoryPath || workspacePath,
          fileTypes: oldWatcher.fileTypes || ["*.*"],
          prompt: oldWatcher.prompt || "",
          mode: oldWatcher.mode || "code",
          active: oldWatcher.active !== undefined ? oldWatcher.active : true,
          createdAt: oldWatcher.createdAt || now,
          updatedAt: now,
          lastTriggeredTime: oldWatcher.lastTriggeredTime,
          lastTaskId: oldWatcher.lastTaskId,
          modeDisplayName: oldWatcher.modeDisplayName,
        });
      }
      if (migratedWatchers.length > 0) {
        await this.saveWatchersForProject(targetProject.id, migratedWatchers);
        console.log(`Migrated ${migratedWatchers.length} watchers to project ${targetProject.name}`);
      }
    }

    await this.context.globalState.update(migrationMarkerKey, true);
    console.log(`Migration completed for workspace: ${workspacePath}`);
    return targetProject; // Return the project used for migration
  }
}
