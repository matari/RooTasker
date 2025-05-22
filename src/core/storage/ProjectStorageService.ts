import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Project, BaseSchedule, BaseWatcher } from '../../shared/ProjectTypes';

const PROJECTS_KEY = 'rootasker.projects';
// For individual project data, we might use keys like:
// `rootasker.project.${projectId}.schedules`
// `rootasker.project.${projectId}.watchers`

export class ProjectStorageService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // --- Project Methods ---

  async getProjects(): Promise<Project[]> {
    return this.context.globalState.get<Project[]>(PROJECTS_KEY) || [];
  }

  async saveProjects(projects: Project[]): Promise<void> {
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
      ...projectData,
      id: vscode.env.machineId + Date.now().toString(), // Simple unique ID
      createdAt: now,
      updatedAt: now,
    };
    projects.push(newProject);
    await this.saveProjects(projects);
    return newProject;
  }

  async updateProject(updatedProject: Project): Promise<Project | undefined> {
    const projects = await this.getProjects();
    const projectIndex = projects.findIndex(p => p.id === updatedProject.id);
    if (projectIndex === -1) {
      return undefined; // Project not found
    }
    projects[projectIndex] = {
      ...updatedProject,
      updatedAt: new Date().toISOString(),
    };
    await this.saveProjects(projects);
    return projects[projectIndex];
  }

  async deleteProject(projectId: string): Promise<boolean> {
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
    return `rootasker.project.${projectId}.schedules`;
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
    return `rootasker.project.${projectId}.watchers`;
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
    const newWatcher: BaseWatcher = {
      ...watcherData,
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

    const migrationMarkerKey = `rootasker.migrated.${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const alreadyMigrated = this.context.globalState.get<boolean>(migrationMarkerKey);

    if (alreadyMigrated) {
      // console.log(`Migration already performed for workspace: ${workspacePath}`);
      return undefined;
    }

    console.log(`Checking for migration for workspace: ${workspacePath}`);

    const oldSchedulesPath = path.join(workspacePath, '.rootasker', 'schedules.json');
    const oldWatchersPath = path.join(workspacePath, '.rootasker', 'watchers.json');

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