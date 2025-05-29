// This script needs to be executed from within the VS Code extension
// to access the extension's globalState for data migration.

// To use this script:
// 1. Add it to src/utils/ directory
// 2. Import and call the function in extension.ts during activation
// 3. Remove after migration is complete

/**
 * Migrates data from RooTasker to RooPlus extension
 * @param {vscode.ExtensionContext} context - The current extension context
 * @param {vscode.OutputChannel} outputChannel - Optional output channel for logging
 * @returns {Promise<boolean>} - True if migration was successful
 */
async function migrateFromRooTasker(context, outputChannel) {
    const log = (message) => {
        if (outputChannel) {
            outputChannel.appendLine(`[Migration] ${message}`);
        }
        console.log(`[Migration] ${message}`);
    };

    log('Starting migration from RooTasker to RooPlus...');

    try {
        // Get the RooTasker extension
        const vscode = require('vscode');
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
        const projectsResult = await rootaskerApi.listProjects();
        if (projectsResult.success && projectsResult.data?.projects?.length > 0) {
            log(`Found ${projectsResult.data.projects.length} projects to migrate`);
            
            // Import needed services
            const { RooPlusAPI } = await import('../api/RooPlusAPI');
            
            // Get the current extension's API
            const rooPlusApi = new RooPlusAPI(context);
            
            // Migrate each project
            for (const project of projectsResult.data.projects) {
                log(`Migrating project: ${project.name} (${project.id})`);
                
                // Create the project in the new extension
                const newProject = await rooPlusApi.createProject({
                    name: project.name,
                    description: project.description || '',
                    directoryPath: project.directoryPath || '',
                    color: project.color || `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`
                });
                
                if (newProject.success && newProject.data?.project) {
                    const newProjectId = newProject.data.project.id;
                    log(`Created new project with ID: ${newProjectId}`);
                    
                    // Migrate schedules for this project
                    const schedulesResult = await rootaskerApi.getProjectSchedules(project.id);
                    if (schedulesResult.success && schedulesResult.data?.schedules?.length > 0) {
                        log(`Found ${schedulesResult.data.schedules.length} schedules to migrate for project ${project.name}`);
                        
                        for (const schedule of schedulesResult.data.schedules) {
                            // Create the schedule in the new project
                            const newSchedule = await rooPlusApi.createSchedule({
                                ...schedule,
                                projectId: newProjectId // Use the new project ID
                            });
                            
                            if (newSchedule.success) {
                                log(`Migrated schedule: ${schedule.name}`);
                            } else {
                                log(`Failed to migrate schedule ${schedule.name}: ${newSchedule.error}`);
                            }
                        }
                    } else {
                        log(`No schedules found for project ${project.name}`);
                    }
                    
                    // Migrate watchers for this project
                    const watchersResult = await rootaskerApi.getProjectWatchers(project.id);
                    if (watchersResult.success && watchersResult.data?.watchers?.length > 0) {
                        log(`Found ${watchersResult.data.watchers.length} watchers to migrate for project ${project.name}`);
                        
                        for (const watcher of watchersResult.data.watchers) {
                            // Create the watcher in the new project
                            const newWatcher = await rooPlusApi.createWatcher({
                                ...watcher,
                                projectId: newProjectId // Use the new project ID
                            });
                            
                            if (newWatcher.success) {
                                log(`Migrated watcher: ${watcher.name}`);
                            } else {
                                log(`Failed to migrate watcher ${watcher.name}: ${newWatcher.error}`);
                            }
                        }
                    } else {
                        log(`No watchers found for project ${project.name}`);
                    }
                } else {
                    log(`Failed to create project ${project.name}: ${newProject.error}`);
                }
            }
        } else {
            log('No projects found to migrate');
        }
        
        // Migrate prompts if needed
        log('Migrating prompts...');
        const promptsResult = await rootaskerApi.listPrompts();
        if (promptsResult.success && promptsResult.data?.prompts?.length > 0) {
            log(`Found ${promptsResult.data.prompts.length} prompts to migrate`);
            
            // Get the current extension's API
            const { RooPlusAPI } = await import('../api/RooPlusAPI');
            const rooPlusApi = new RooPlusAPI(context);
            
            // Migrate each prompt
            for (const prompt of promptsResult.data.prompts) {
                // Skip system prompts
                if (prompt.id.startsWith('@@System')) {
                    log(`Skipping system prompt: ${prompt.title}`);
                    continue;
                }
                
                log(`Migrating prompt: ${prompt.title}`);
                
                // Create the prompt in the new extension
                const newPrompt = await rooPlusApi.createPrompt({
                    title: prompt.title,
                    description: prompt.description || '',
                    content: prompt.content || '',
                    tags: prompt.tags || []
                });
                
                if (newPrompt.success) {
                    log(`Migrated prompt: ${prompt.title}`);
                } else {
                    log(`Failed to migrate prompt ${prompt.title}: ${newPrompt.error}`);
                }
            }
        } else {
            log('No prompts found to migrate');
        }
        
        log('Migration completed successfully!');
        log('Please restart VS Code for all changes to take effect.');
        return true;
    } catch (error) {
        log(`Error during migration: ${error.message}`);
        log(`Stack trace: ${error.stack}`);
        return false;
    }
}

module.exports = { migrateFromRooTasker };
