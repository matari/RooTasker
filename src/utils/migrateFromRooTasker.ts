import * as vscode from 'vscode';
import { 
    CreateProjectData, 
    CreateScheduleData, 
    CreateWatcherData, 
    CreatePromptData,
    ProjectResult,
    ScheduleResult,
    WatcherResult,
    PromptResult
} from '../api/RooPlusAPI';

// Define interfaces for the RooTasker API results
interface RooTaskerProjectsResult {
    success: boolean;
    data?: {
        projects: Array<{
            id: string;
            name: string;
            description?: string;
            directoryPath?: string;
            color?: string;
        }>;
    };
    error?: string;
}

interface RooTaskerSchedulesResult {
    success: boolean;
    data?: {
        schedules: Array<any>;
    };
    error?: string;
}

interface RooTaskerWatchersResult {
    success: boolean;
    data?: {
        watchers: Array<any>;
    };
    error?: string;
}

interface RooTaskerPromptsResult {
    success: boolean;
    data?: {
        prompts: Array<{
            id: string;
            title: string;
            description?: string;
            content?: string;
            tags?: string[];
        }>;
    };
    error?: string;
}

/**
 * Migrates data from RooTasker to RooPlus extension
 * @param context The current extension context
 * @param outputChannel Optional output channel for logging
 * @returns Promise<boolean> True if migration was successful
 */
export async function migrateFromRooTasker(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel): Promise<boolean> {
    const log = (message: string): void => {
        if (outputChannel) {
            outputChannel.appendLine(`[Migration] ${message}`);
        }
        console.log(`[Migration] ${message}`);
    };

    log('Starting migration from RooTasker to RooPlus...');

    try {
        // Get the RooTasker extension
        const rootaskerExtension = vscode.extensions.getExtension('kylehoskins.roo-tasker');
        
        if (!rootaskerExtension) {
            log('RooTasker extension not found, skipping database migration');
            return false;
        }

        // Activate the RooTasker extension if it's not already activated
        if (!rootaskerExtension.isActive) {
            log('Activating RooTasker extension...');
            await rootaskerExtension.activate();
        }

        // Get the RooTasker API
        const rootaskerApi = rootaskerExtension.exports;
        
        // Check if the API is available
        if (!rootaskerApi) {
            log('RooTasker API not available, skipping database migration');
            return false;
        }

        // Migrate projects
        log('Migrating projects...');
        const projectsResult = await rootaskerApi.listProjects() as RooTaskerProjectsResult;
        if (projectsResult.success && projectsResult.data?.projects?.length > 0) {
            log(`Found ${projectsResult.data.projects.length} projects to migrate`);
            
            // Use the VS Code commands directly to access the RooPlus API
            
            // Migrate each project
            for (const project of projectsResult.data.projects) {
                log(`Migrating project: ${project.name} (${project.id})`);
                
                // Create the project in the new extension
                const newProject = await vscode.commands.executeCommand('rooplus.api.createProject', {
                    name: project.name,
                    description: project.description || '',
                    directoryPath: project.directoryPath || '',
                    color: project.color || `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`
                });
                
                if ((newProject as ProjectResult).success && (newProject as ProjectResult).data?.project) {
                    const newProjectId = (newProject as ProjectResult).data.project.id;
                    log(`Created new project with ID: ${newProjectId}`);
                    
                    // Migrate schedules for this project
                    const schedulesResult = await rootaskerApi.getProjectSchedules(project.id) as RooTaskerSchedulesResult;
                    if (schedulesResult.success && schedulesResult.data?.schedules?.length > 0) {
                        log(`Found ${schedulesResult.data.schedules.length} schedules to migrate for project ${project.name}`);
                        
                        for (const schedule of schedulesResult.data.schedules) {
                            // Create the schedule in the new project
                            const newSchedule = await vscode.commands.executeCommand('rooplus.api.createSchedule', {
                                ...schedule,
                                projectId: newProjectId // Use the new project ID
                            });
                            
                            if ((newSchedule as ScheduleResult).success) {
                                log(`Migrated schedule: ${schedule.name}`);
                            } else {
                                log(`Failed to migrate schedule ${schedule.name}: ${(newSchedule as ScheduleResult).error}`);
                            }
                        }
                    } else {
                        log(`No schedules found for project ${project.name}`);
                    }
                    
                    // Migrate watchers for this project
                    const watchersResult = await rootaskerApi.getProjectWatchers(project.id) as RooTaskerWatchersResult;
                    if (watchersResult.success && watchersResult.data?.watchers?.length > 0) {
                        log(`Found ${watchersResult.data.watchers.length} watchers to migrate for project ${project.name}`);
                        
                        for (const watcher of watchersResult.data.watchers) {
                            // Create the watcher in the new project
                            const newWatcher = await vscode.commands.executeCommand('rooplus.api.createWatcher', {
                                ...watcher,
                                projectId: newProjectId // Use the new project ID
                            });
                            
                            if ((newWatcher as WatcherResult).success) {
                                log(`Migrated watcher: ${watcher.name}`);
                            } else {
                                log(`Failed to migrate watcher ${watcher.name}: ${(newWatcher as WatcherResult).error}`);
                            }
                        }
                    } else {
                        log(`No watchers found for project ${project.name}`);
                    }
                } else {
                    log(`Failed to create project ${project.name}: ${(newProject as ProjectResult).error}`);
                }
            }
        } else {
            log('No projects found to migrate');
        }
        
        // Migrate prompts if needed
        log('Migrating prompts...');
        const promptsResult = await rootaskerApi.listPrompts() as RooTaskerPromptsResult;
        if (promptsResult.success && promptsResult.data?.prompts?.length > 0) {
            log(`Found ${promptsResult.data.prompts.length} prompts to migrate`);
            
            // Use the VS Code commands directly to access the RooPlus API
            
            // Migrate each prompt
            for (const prompt of promptsResult.data.prompts) {
                // Skip system prompts
                if (prompt.id.startsWith('@@System')) {
                    log(`Skipping system prompt: ${prompt.title}`);
                    continue;
                }
                
                log(`Migrating prompt: ${prompt.title}`);
                
                // Create the prompt in the new extension
                const newPrompt = await vscode.commands.executeCommand('rooplus.api.createPrompt', {
                    title: prompt.title,
                    description: prompt.description || '',
                    content: prompt.content || '',
                    tags: prompt.tags || []
                });
                
                if ((newPrompt as PromptResult).success) {
                    log(`Migrated prompt: ${prompt.title}`);
                } else {
                    log(`Failed to migrate prompt ${prompt.title}: ${(newPrompt as PromptResult).error}`);
                }
            }
        } else {
            log('No prompts found to migrate');
        }
        
        log('Migration completed successfully!');
        log('Please restart VS Code for all changes to take effect.');
        return true;
    } catch (error: any) {
        log(`Error during migration: ${error.message}`);
        log(`Stack trace: ${error.stack}`);
        return false;
    }
}
