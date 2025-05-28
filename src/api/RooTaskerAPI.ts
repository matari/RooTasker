import { Project, BaseSchedule, BaseWatcher } from '../shared/ProjectTypes';
// import { RooTaskerMcpServerSimple } from '../mcp_server/RooTaskerMcpServerSimple'; // MCP Server REMOVED
import { Schedule } from '../services/scheduler/SchedulerService'; // For full Schedule type if needed by create/update

// --- Generic Command Result ---
export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Project Types ---
export interface CreateProjectData {
  name: string;
  description?: string;
  directoryPath?: string;
  color?: string;
}
export type ProjectResult = CommandResult<Project>;
export type ListProjectsResult = CommandResult<{ projects: Project[] }>;
export type GetProjectResult = CommandResult<{ project?: Project }>; // project can be undefined if not found
export interface UpdateProjectData {
  name?: string;
  description?: string;
  directoryPath?: string;
  color?: string;
}
export type UpdateProjectResult = CommandResult<{ project?: Project }>;
export type DeleteProjectResult = CommandResult<null>; // Or just { success: boolean; error?: string }

// --- Schedule Types ---
// Using Omit for create/update data to exclude generated fields
export type CreateScheduleData = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName' | 'projectId'> & { projectId: string; modeDisplayName?: string };
export type UpdateScheduleData = Partial<Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName' | 'projectId'>> & { mode?: string; modeDisplayName?: string };

export type ScheduleResult = CommandResult<BaseSchedule>;
export type ListSchedulesResult = CommandResult<{ schedules: BaseSchedule[] }>; // Assuming API lists all, or per project
export type GetScheduleResult = CommandResult<{ schedule?: BaseSchedule }>;
export type UpdateScheduleResult = CommandResult<{ schedule?: BaseSchedule }>;
export type DeleteScheduleResult = CommandResult<null>;
export type ToggleScheduleResult = CommandResult<{ schedule?: BaseSchedule }>;
export type RunScheduleResult = CommandResult<null>;
export type GetProjectSchedulesResult = CommandResult<{ schedules: BaseSchedule[] }>;


// --- Watcher Types ---
export type CreateWatcherData = Omit<BaseWatcher, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName' | 'projectId'> & { projectId: string; modeDisplayName?: string };
export type UpdateWatcherData = Partial<Omit<BaseWatcher, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName' | 'projectId'>> & { mode?: string; modeDisplayName?: string };

export type WatcherResult = CommandResult<BaseWatcher>;
export type ListWatchersResult = CommandResult<{ watchers: BaseWatcher[] }>; // For a specific project
export type GetWatcherResult = CommandResult<{ watcher?: BaseWatcher }>; // If we add a get specific watcher API
export type UpdateWatcherResult = CommandResult<{ watcher?: BaseWatcher }>;
export type DeleteWatcherResult = CommandResult<null>;
export type ToggleWatcherResult = CommandResult<{ watcher?: BaseWatcher }>;
export type GetProjectWatchersResult = CommandResult<{ watchers: BaseWatcher[] }>;

// --- Prompt Types ---
// Assuming Prompt is defined in '../shared/ProjectTypes'
import { Prompt } from '../shared/ProjectTypes';

export type CreatePromptData = Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>;
export type UpdatePromptData = Partial<Omit<Prompt, 'id' | 'createdAt'>>; // Allow updating isArchived and tags

export type PromptResult = CommandResult<Prompt>;
export type ListPromptsResult = CommandResult<{ prompts: Prompt[] }>;
export type GetPromptResult = CommandResult<{ prompt?: Prompt }>;
export type UpdatePromptResult = CommandResult<{ prompt?: Prompt }>;
export type DeletePromptResult = CommandResult<null>;
export type ArchivePromptResult = CommandResult<{ prompt?: Prompt }>; // Returns the updated prompt

// TODO: Define PromptUsageResult structure if needed for getPromptUsage
// export type PromptUsageResult = CommandResult<{ schedules: string[], watchers: string[] }>;


export interface RooTaskerAPI {
  // Project methods
  createProject(data: CreateProjectData): Promise<ProjectResult>;
  listProjects(): Promise<ListProjectsResult>;
  getProject(projectId: string): Promise<GetProjectResult>;
  updateProject(projectId: string, updates: UpdateProjectData): Promise<UpdateProjectResult>;
  deleteProject(projectId: string): Promise<DeleteProjectResult>;
  getProjectSchedules(projectId: string): Promise<GetProjectSchedulesResult>;
  getProjectWatchers(projectId: string): Promise<GetProjectWatchersResult>;

  // Schedule methods
  createSchedule(data: CreateScheduleData): Promise<ScheduleResult>;
  listSchedules(): Promise<ListSchedulesResult>; // Lists all schedules across all projects
  getSchedule(scheduleId: string): Promise<GetScheduleResult>;
  updateSchedule(scheduleId: string, updates: UpdateScheduleData): Promise<UpdateScheduleResult>;
  deleteSchedule(scheduleId: string): Promise<DeleteScheduleResult>;
  toggleScheduleActive(scheduleId: string, active: boolean): Promise<ToggleScheduleResult>;
  runScheduleNow(scheduleId: string): Promise<RunScheduleResult>;

  // Watcher methods
  createWatcher(data: CreateWatcherData): Promise<WatcherResult>;
  // listWatchers() - for all watchers across all projects (if implemented, or use getProjectWatchers iteratively)
  // listWatchersForProject(projectId: string): Promise<ListWatchersResult>; // Covered by getProjectWatchers
  updateWatcher(projectId: string, watcherId: string, updates: UpdateWatcherData): Promise<UpdateWatcherResult>;
  deleteWatcher(projectId: string, watcherId: string): Promise<DeleteWatcherResult>;
  toggleWatcherActive(projectId: string, watcherId: string, active: boolean): Promise<ToggleWatcherResult>;

  // Prompt methods
  createPrompt(data: CreatePromptData): Promise<PromptResult>;
  listPrompts(filters?: any): Promise<ListPromptsResult>; // Define filters if needed
  getPrompt(promptId: string): Promise<GetPromptResult>;
  updatePrompt(promptId: string, updates: UpdatePromptData): Promise<UpdatePromptResult>;
  deletePrompt(promptId: string): Promise<DeletePromptResult>;
  archivePrompt(promptId: string, archive: boolean): Promise<ArchivePromptResult>;
  // getPromptUsage(promptId: string): Promise<PromptUsageResult>; // If implemented

  // MCP Server access // MCP Server REMOVED
  // getMcpServer(): RooTaskerMcpServerSimple; // MCP Server REMOVED
}
