import * as vscode from "vscode"
import * as dotenvx from "@dotenvx/dotenvx"
import * as path from "path"
import * as fs from "fs/promises"
import { getWorkspacePath } from "./utils/path"
import { fileExistsAtPath } from "./utils/fs"

// Load environment variables from .env file
try {
	// Specify path to .env file in the project root directory
	const envPath = path.join(__dirname, "..", ".env")
	dotenvx.config({ path: envPath })
} catch (e) {
	// Silently handle environment loading errors
	console.warn("Failed to load environment variables:", e)
}

import "./utils/path" // Necessary to have access to String.prototype.toPosix.

import { initializeI18n } from "./i18n"
import { CodeActionProvider } from "./core/CodeActionProvider"
import { migrateSettings } from "./utils/migrateSettings"
import { formatLanguage } from "./shared/language"
import { ClineProvider } from "./core/webview/ClineProvider"
import { CustomModesManager } from "./core/config/CustomModesManager" // Added
import { getAllModes } from "./shared/modes" // Added
import { Schedule } from "./services/scheduler/SchedulerService"
import { RooService } from "./services/scheduler/RooService"
import { WatcherService } from "./services/watchers/WatcherService"
import { ProjectStorageService } from "./core/storage/ProjectStorageService" 
import { PromptStorageService } from "./core/storage/PromptStorageService"; // Added for Prompts
// import { VoiceRecorderServer } from "./recorder_server/main"; // REMOVED for Voice Recorder
// import { RooTaskerMcpServerSimple } from "./mcp_server/RooTaskerMcpServerSimple" // MCP Server REMOVED
import {
	RooTaskerAPI,
	CreateProjectData, ProjectResult, ListProjectsResult, GetProjectResult, UpdateProjectData, UpdateProjectResult, DeleteProjectResult,
	CreateScheduleData, ScheduleResult, ListSchedulesResult, GetScheduleResult, UpdateScheduleData, UpdateScheduleResult, DeleteScheduleResult, ToggleScheduleResult, RunScheduleResult, GetProjectSchedulesResult,
	CreateWatcherData, WatcherResult, ListWatchersResult, UpdateWatcherData, UpdateWatcherResult, DeleteWatcherResult, ToggleWatcherResult, GetProjectWatchersResult,
	CreatePromptData, PromptResult, ListPromptsResult, GetPromptResult, UpdatePromptData, UpdatePromptResult, DeletePromptResult, ArchivePromptResult // Added for Prompts
} from "./api/RooTaskerAPI";

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext
// let voiceRecorderServer: VoiceRecorderServer | undefined; // REMOVED for Voice Recorder

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext): Promise<RooTaskerAPI> {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel("RooTasker")
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine("RooTasker extension activated")

	// Set a custom context variable for development mode
	// This is used to conditionally show the reload window button
	const isDevelopmentMode = context.extensionMode === vscode.ExtensionMode.Development
	await vscode.commands.executeCommand('setContext', 'rooTaskerDevMode', isDevelopmentMode)
	
	// Migrate old settings to new
	await migrateSettings(context, outputChannel)

	// Initialize the scheduler service
	const { SchedulerService } = await import('./services/scheduler/SchedulerService')
	const schedulerService = SchedulerService.getInstance(context)
	await schedulerService.initialize()
	outputChannel.appendLine("Scheduler service initialized")

	// Initialize the watcher service
	const watcherService = WatcherService.getInstance(context)
	await watcherService.initialize()
	outputChannel.appendLine("Watcher service initialized")
	context.subscriptions.push(watcherService); // Add to subscriptions for dispose on deactivate

	// Initialize ProjectStorageService
	const projectStorageService = new ProjectStorageService(context);
	outputChannel.appendLine("ProjectStorageService initialized");

	// Initialize PromptStorageService
	const promptStorageService = new PromptStorageService(context);
	outputChannel.appendLine("PromptStorageService initialized");
	
	// Initialize example prompts if none exist
	await promptStorageService.initializeExamplePrompts();

	// REMOVED Voice Recorder Server Initialization

	// Initialize i18n for internationalization support
	initializeI18n(context.globalState.get("language") ?? formatLanguage(vscode.env.language))


	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration("roo-cline").get<string[]>("allowedCommands") || []

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}
	
	// Register command to reload window (dev only button)
	context.subscriptions.push(
		vscode.commands.registerCommand("rootasker.reloadWindowDev", async () => {
			await vscode.commands.executeCommand("workbench.action.reloadWindow")
		})
	)

	// Register command to open the roo-cline extension (always register)
	context.subscriptions.push(
		vscode.commands.registerCommand("rootasker.openRooClineExtension", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.roo-cline-ActivityBar")
		})
	)

	// Register command to handle schedule updates and notify the webview
	context.subscriptions.push(
		vscode.commands.registerCommand("rootasker.schedulesUpdated", async () => {
			// This command is called when schedules are updated
			// Simply trigger a state refresh which will cause the webview to reload its data
			console.log("Schedules updated sending message to webview")
			await provider.postMessageToWebview({type:'schedulesUpdated'});
		})
	)

	const provider = new ClineProvider(context, outputChannel, "sidebar") // REMOVED voiceRecorderServer


	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)


	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()


	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)


	// Implements the `RooCodeAPI` interface.
	const socketPath = process.env.ROO_CODE_IPC_SOCKET_PATH
	const enableLogging = typeof socketPath === "string"

	// MCP Server REMOVED
	// const rooTaskerMcpServer = new RooTaskerMcpServerSimple(context);
	// await rooTaskerMcpServer.start(); 
	// context.subscriptions.push(rooTaskerMcpServer); 
	// outputChannel.appendLine("RooTasker SIMPLIFIED MCP Server initialized and started.");

	// Register API commands (can also be used by other extensions or for testing)
	// Ensure CustomModesManager is available for modeDisplayName lookup
	const customModesManager = new CustomModesManager(context, async () => {
		// This callback is for when custom modes change, which might trigger a webview update.
		// For API commands, we just need to fetch current modes.
		// If provider instance is needed for this callback, it might need to be passed or accessed differently.
		// For now, assuming this callback is primarily for webview updates.
		if (provider) {
			await provider.postStateToWebview();
		}
	});
	context.subscriptions.push(customModesManager);


	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.createSchedule', async (scheduleData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { modeDisplayName?: string }) => {
			try {
				// schedulerService is already defined in the activate scope
        		const availableModes = getAllModes(await customModesManager.getCustomModes());
				const modeConfig = availableModes.find(m => m.slug === scheduleData.mode);
				
				const fullScheduleData = {
					...scheduleData,
					modeDisplayName: modeConfig?.name || scheduleData.mode, // Ensure modeDisplayName is set
				};
				
				const newSchedule = await schedulerService.addScheduleProgrammatic(fullScheduleData as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>);
				return { success: true, schedule: newSchedule };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.createSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.updateSchedule', async (args: { scheduleId: string, updates: Partial<Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'>> & { mode?: string, modeDisplayName?: string } }) => {
			try {
				// schedulerService is already defined
				let finalUpdates = { ...args.updates }; // Clone to avoid modifying input
				if (args.updates.mode) {
        			const availableModes = getAllModes(await customModesManager.getCustomModes());
					const modeConfig = availableModes.find(m => m.slug === args.updates.mode);
					finalUpdates.modeDisplayName = modeConfig?.name || args.updates.mode;
				}
				// Cast to Partial<Schedule> as updateSchedule expects that
				const updatedSchedule = await schedulerService.updateSchedule(args.scheduleId, finalUpdates as Partial<Schedule>);
				return { success: true, schedule: updatedSchedule };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.updateSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.deleteSchedule', async (args: { scheduleId: string }) => {
			try {
				// schedulerService is already defined
				const success = await schedulerService.deleteScheduleProgrammatic(args.scheduleId);
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.deleteSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.toggleScheduleActive', async (args: { scheduleId: string, active: boolean }) => {
			try {
				// schedulerService is already defined
				await schedulerService.toggleScheduleActive(args.scheduleId, args.active);
				const updatedSchedule = schedulerService.getScheduleById(args.scheduleId);
				return { success: true, schedule: updatedSchedule };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.toggleScheduleActive: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.runScheduleNow', async (args: { scheduleId: string }) => {
			try {
				// schedulerService is already defined
				await schedulerService.runScheduleNow(args.scheduleId);
				return { success: true };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.runScheduleNow: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.getSchedule', (args: { scheduleId: string }) => {
			try {
				// schedulerService is already defined
				const schedule = schedulerService.getScheduleById(args.scheduleId);
				return { success: true, schedule: schedule };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.getSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.listSchedules', () => {
			try {
				// schedulerService is already defined
				const schedules = schedulerService.getAllSchedules();
				return { success: true, schedules: schedules };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.listSchedules: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	// Register Project API commands
	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.createProject', async (projectData: {
			name: string,
			description?: string,
			directoryPath?: string,
			color?: string
		}) => {
			try {
				// Enhanced debug logging to see what we're receiving
				outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): INVOKED! Received projectData: ${JSON.stringify(projectData, null, 2)}`);
				console.log(`DEBUG VSCODE CMD (createProject): INVOKED! Received projectData: ${JSON.stringify(projectData, null, 2)}`);
				outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): typeof projectData: ${typeof projectData}`);
				outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): projectData is null/undefined: ${projectData == null}`);
				
				if (projectData) {
					outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): projectData.name = "${projectData.name}" (type: ${typeof projectData.name})`);
					outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): projectData.description = "${projectData.description}" (type: ${typeof projectData.description})`);
					outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): projectData.directoryPath = "${projectData.directoryPath}" (type: ${typeof projectData.directoryPath})`);
					outputChannel.appendLine(`DEBUG VSCODE CMD (createProject): projectData.color = "${projectData.color}" (type: ${typeof projectData.color})`);
				}
				
				// projectStorageService is initialized in the activate scope
				const projectDataWithDefaults = {
					name: projectData.name ?? "Unnamed Project", // Use nullish coalescing to preserve empty strings
					description: projectData.description ?? "", // Ensure description is a string
					directoryPath: projectData.directoryPath ?? getWorkspacePath(context.globalStorageUri.fsPath), // Default to workspace path or a fallback
					color: projectData.color ?? `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}` // Default color if not provided
				};
				
				outputChannel.appendLine(`DEBUG: Project data with defaults: ${JSON.stringify(projectDataWithDefaults, null, 2)}`);
				
				const newProject = await projectStorageService.addProject(projectDataWithDefaults);
				
				outputChannel.appendLine(`DEBUG: Created project: ${JSON.stringify(newProject, null, 2)}`);
				
				// Notify webview of project changes
				await provider.postMessageToWebview({ type: 'projectsUpdated' }); // This type needs to be added to WebviewMessageType
				return { success: true, project: newProject };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.createProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.getProject', async (args: { projectId: string }) => {
			try {
				const project = await projectStorageService.getProject(args.projectId);
				return { success: true, project: project };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.getProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.listProjects', async () => {
			try {
				const projects = await projectStorageService.getProjects();
				return { success: true, projects: projects };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.listProjects: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.updateProject', async (args: {
			projectId: string,
			updates: { // Use the Project type for updates, but make fields optional
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
				
				// Construct the full project object with updates
				const projectToUpdate = {
					...project,
					...args.updates
				};
				
				const updatedProject = await projectStorageService.updateProject(projectToUpdate);
				// Notify webview of project changes
				await provider.postMessageToWebview({ type: 'projectsUpdated' });
				return { success: true, project: updatedProject };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.updateProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.deleteProject', async (args: { projectId: string }) => {
			try {
				const success = await projectStorageService.deleteProject(args.projectId);
				if (success) {
					// Notify webview of project changes
					await provider.postMessageToWebview({ type: 'projectsUpdated' });
				}
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.deleteProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	// Register command to handle project updates and notify the webview (similar to schedulesUpdated)
	context.subscriptions.push(
		vscode.commands.registerCommand("rootasker.projectsUpdated", async () => {
			console.log("Projects updated, sending message to webview");
			await provider.postMessageToWebview({ type: 'projectsUpdated' });
		})
	);

	// Register Watcher API commands
	// Assuming Watcher type is imported or accessible. From WatcherService, it's 'Watcher' from '../../../webview-ui/src/components/watchers/types'
	// For parameters, we'll define inline types or use Omit/Partial from the Watcher type.
	// Need to import Watcher type if not already. It's imported by WatcherService.
	// Let's assume Watcher type from './services/watchers/WatcherService' or a shared type is appropriate.
	// From WatcherService: import { Watcher } from '../../../webview-ui/src/components/watchers/types';

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.createWatcher', async (watcherData: {
			projectId: string; // Watchers are project-specific
			name: string;
			directoryPath: string;
			fileTypes: string[];
			prompt: string;
			mode: string;
			active?: boolean;
		}) => {
			try {
				const availableModes = getAllModes(await customModesManager.getCustomModes());
				const modeConfig = availableModes.find(m => m.slug === watcherData.mode);
				
				const fullWatcherData = {
					...watcherData,
					modeDisplayName: modeConfig?.name || watcherData.mode,
					active: watcherData.active !== undefined ? watcherData.active : true, // Default to true
				};
				
				// WatcherService.addWatcher expects Omit<Watcher, 'id' | 'createdAt' | 'updatedAt'>
				// The ProjectStorageService handles adding watchers to projects.
				const newWatcher = await projectStorageService.addWatcherToProject(watcherData.projectId, fullWatcherData);
				if (newWatcher) {
					// After adding to storage, ensure the WatcherService itself is aware if it manages active watchers in memory
					// This might involve calling a method on watcherService or re-initializing its internal list for that project.
					// For now, we assume ProjectStorageService handles persistence and WatcherService reloads or is notified.
					// Let's trigger a general watchersUpdated event.
					await provider.postMessageToWebview({ type: 'watchersUpdated' });
				}
				return { success: !!newWatcher, watcher: newWatcher };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.createWatcher: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.listWatchers', async (args: { projectId: string }) => {
			try {
				const watchers = await projectStorageService.getWatchersForProject(args.projectId);
				return { success: true, watchers: watchers };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.listWatchers: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.updateWatcher', async (args: {
			projectId: string;
			watcherId: string;
			updates: Partial<{ // Omit id, projectId, createdAt, updatedAt from direct updates
				name: string;
				directoryPath: string;
				fileTypes: string[];
				prompt: string;
				mode: string;
				active: boolean;
				modeDisplayName: string; // Allow updating this too
			}>;
		}) => {
			try {
				const watchers = await projectStorageService.getWatchersForProject(args.projectId);
				const watcherToUpdate = watchers.find(w => w.id === args.watcherId);

				if (!watcherToUpdate) {
					return { success: false, error: `Watcher with ID ${args.watcherId} in project ${args.projectId} not found` };
				}
				
				let finalUpdates = { ...args.updates };
				if (args.updates.mode && !args.updates.modeDisplayName) { // If mode changes, update display name
					const availableModes = getAllModes(await customModesManager.getCustomModes());
					const modeConfig = availableModes.find(m => m.slug === args.updates.mode);
					finalUpdates.modeDisplayName = modeConfig?.name || args.updates.mode;
				}

				const updatedWatcherData = {
					...watcherToUpdate,
					...finalUpdates
				};
				
				const updatedWatcher = await projectStorageService.updateWatcherInProject(args.projectId, updatedWatcherData);
				if (updatedWatcher) {
					// Notify WatcherService to re-evaluate its file system watchers
					await watcherService.updateWatcher(updatedWatcher.id, updatedWatcher); // This method in WatcherService handles re-setup
					await provider.postMessageToWebview({ type: 'watchersUpdated' });
				}
				return { success: !!updatedWatcher, watcher: updatedWatcher };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.updateWatcher: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.deleteWatcher', async (args: { projectId: string, watcherId: string }) => {
			try {
				const success = await projectStorageService.deleteWatcherFromProject(args.projectId, args.watcherId);
				if (success) {
					await watcherService.deleteWatcher(args.watcherId); // Notify WatcherService to remove its file system watcher
					await provider.postMessageToWebview({ type: 'watchersUpdated' });
				}
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.deleteWatcher: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.toggleWatcherActive', async (args: { projectId: string, watcherId: string, active: boolean }) => {
			try {
				const watchers = await projectStorageService.getWatchersForProject(args.projectId);
				const watcherToUpdate = watchers.find(w => w.id === args.watcherId);
				if (!watcherToUpdate) {
					return { success: false, error: `Watcher with ID ${args.watcherId} not found` };
				}
				watcherToUpdate.active = args.active;
				const updatedWatcher = await projectStorageService.updateWatcherInProject(args.projectId, watcherToUpdate);
				
				if (updatedWatcher) {
					// This will trigger re-setup in WatcherService via its updateWatcher method logic
					await watcherService.toggleWatcherActive(args.watcherId, args.active);
					await provider.postMessageToWebview({ type: 'watchersUpdated' });
				}
				return { success: !!updatedWatcher, watcher: updatedWatcher };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.toggleWatcherActive: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	// Register command to handle watcher updates and notify the webview
	context.subscriptions.push(
		vscode.commands.registerCommand("rootasker.watchersUpdated", async () => {
			console.log("Watchers updated, sending message to webview");
			await provider.postMessageToWebview({ type: 'watchersUpdated' });
		})
	);

	// Register Prompt API commands
	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.createPrompt', async (promptData: CreatePromptData): Promise<PromptResult> => {
			try {
				const newPrompt = await promptStorageService.addPrompt(promptData);
				await provider.postMessageToWebview({ type: 'promptsUpdated' }); 
				return { success: true, data: newPrompt }; // Corrected: data is Prompt
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.createPrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.listPrompts', async (/* filters?: any */): Promise<ListPromptsResult> => {
			try {
				const prompts = await promptStorageService.getPrompts();
				// TODO: Apply filters if any are passed and implemented
				return { success: true, data: { prompts } };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.listPrompts: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.getPrompt', async (args: { promptId: string }): Promise<GetPromptResult> => {
			try {
				const prompt = await promptStorageService.getPrompt(args.promptId);
				return { success: true, data: { prompt } }; // Reverted to { prompt: ... }
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.getPrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.updatePrompt', async (args: { promptId: string, updates: UpdatePromptData }): Promise<UpdatePromptResult> => {
			try {
				const updatedPrompt = await promptStorageService.updatePrompt(args.promptId, args.updates);
				if (updatedPrompt) {
					await provider.postMessageToWebview({ type: 'promptsUpdated' });
				}
				return { success: !!updatedPrompt, data: { prompt: updatedPrompt } }; // Reverted to { prompt: ... }
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.updatePrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.deletePrompt', async (args: { promptId: string }): Promise<DeletePromptResult> => {
			try {
				const success = await promptStorageService.deletePrompt(args.promptId);
				if (success) {
					await provider.postMessageToWebview({ type: 'promptsUpdated' });
				}
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.deletePrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rootasker.api.archivePrompt', async (args: { promptId: string, archive: boolean }): Promise<ArchivePromptResult> => {
			try {
				const updatedPrompt = await promptStorageService.archivePrompt(args.promptId, args.archive);
				if (updatedPrompt) {
					await provider.postMessageToWebview({ type: 'promptsUpdated' });
				}
				return { success: !!updatedPrompt, data: { prompt: updatedPrompt } }; // Reverted to { prompt: ... }
			} catch (error) {
				outputChannel.appendLine(`Error in rootasker.api.archivePrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	
	// Register command to handle prompt updates and notify the webview
	context.subscriptions.push(
		vscode.commands.registerCommand("rootasker.promptsUpdated", async () => {
			console.log("Prompts updated, sending message to webview");
			await provider.postMessageToWebview({ type: 'promptsUpdated' });
		})
	);

	// Create the API object to be returned
	const api: RooTaskerAPI = {
		createProject: async (data: CreateProjectData): Promise<ProjectResult> => {
			return await vscode.commands.executeCommand('rootasker.api.createProject', data);
		},
		listProjects: async (): Promise<ListProjectsResult> => {
			return await vscode.commands.executeCommand('rootasker.api.listProjects');
		},
		getProject: async (projectId: string): Promise<GetProjectResult> => {
			return await vscode.commands.executeCommand('rootasker.api.getProject', { projectId });
		},
		updateProject: async (projectId: string, updates: UpdateProjectData): Promise<UpdateProjectResult> => {
			return await vscode.commands.executeCommand('rootasker.api.updateProject', { projectId, updates });
		},
		deleteProject: async (projectId: string): Promise<DeleteProjectResult> => {
			return await vscode.commands.executeCommand('rootasker.api.deleteProject', { projectId });
		},
		getProjectSchedules: async (projectId: string): Promise<GetProjectSchedulesResult> => {
			// Assuming 'rootasker.api.listSchedules' can take a projectId or we need a new command
			// For now, let's assume listSchedules is global and we filter, or a specific command exists.
			// The MCP tool GetProjectSchedulesTool calls 'rootasker.api.listSchedules' and filters.
			// Let's make a dedicated command for this for a cleaner API.
			// If 'rootasker.api.listSchedules' is already project-specific, this is fine.
			// Based on current command registration, 'listSchedules' is global.
			// We should add a new command 'rootasker.api.getProjectSchedules'
			// For now, this will mimic the MCP tool's behavior if a direct command isn't available.
			const allSchedulesResult: ListSchedulesResult = await vscode.commands.executeCommand('rootasker.api.listSchedules');
			if (allSchedulesResult.success && allSchedulesResult.data?.schedules) {
				const projectSchedules = allSchedulesResult.data.schedules.filter(s => s.projectId === projectId);
				return { success: true, data: { schedules: projectSchedules } };
			}
			return { success: false, error: allSchedulesResult.error || "Failed to retrieve project schedules" };
		},
		getProjectWatchers: async (projectId: string): Promise<GetProjectWatchersResult> => {
			return await vscode.commands.executeCommand('rootasker.api.listWatchers', { projectId });
		},
		createSchedule: async (data: CreateScheduleData): Promise<ScheduleResult> => {
			return await vscode.commands.executeCommand('rootasker.api.createSchedule', data);
		},
		listSchedules: async (): Promise<ListSchedulesResult> => { // This lists ALL schedules
			return await vscode.commands.executeCommand('rootasker.api.listSchedules');
		},
		getSchedule: async (scheduleId: string): Promise<GetScheduleResult> => {
			return await vscode.commands.executeCommand('rootasker.api.getSchedule', { scheduleId });
		},
		updateSchedule: async (scheduleId: string, updates: UpdateScheduleData): Promise<UpdateScheduleResult> => {
			return await vscode.commands.executeCommand('rootasker.api.updateSchedule', { scheduleId, updates });
		},
		deleteSchedule: async (scheduleId: string): Promise<DeleteScheduleResult> => {
			return await vscode.commands.executeCommand('rootasker.api.deleteSchedule', { scheduleId });
		},
		toggleScheduleActive: async (scheduleId: string, active: boolean): Promise<ToggleScheduleResult> => {
			return await vscode.commands.executeCommand('rootasker.api.toggleScheduleActive', { scheduleId, active });
		},
		runScheduleNow: async (scheduleId: string): Promise<RunScheduleResult> => {
			return await vscode.commands.executeCommand('rootasker.api.runScheduleNow', { scheduleId });
		},
		createWatcher: async (data: CreateWatcherData): Promise<WatcherResult> => {
			return await vscode.commands.executeCommand('rootasker.api.createWatcher', data);
		},
		updateWatcher: async (projectId: string, watcherId: string, updates: UpdateWatcherData): Promise<UpdateWatcherResult> => {
			return await vscode.commands.executeCommand('rootasker.api.updateWatcher', { projectId, watcherId, updates });
		},
		deleteWatcher: async (projectId: string, watcherId: string): Promise<DeleteWatcherResult> => {
			return await vscode.commands.executeCommand('rootasker.api.deleteWatcher', { projectId, watcherId });
		},
		toggleWatcherActive: async (projectId: string, watcherId: string, active: boolean): Promise<ToggleWatcherResult> => {
			return await vscode.commands.executeCommand('rootasker.api.toggleWatcherActive', { projectId, watcherId, active });
		},

		// Prompt methods
		createPrompt: async (data: CreatePromptData): Promise<PromptResult> => {
			return await vscode.commands.executeCommand('rootasker.api.createPrompt', data);
		},
		listPrompts: async (filters?: any): Promise<ListPromptsResult> => {
			return await vscode.commands.executeCommand('rootasker.api.listPrompts', filters);
		},
		getPrompt: async (promptId: string): Promise<GetPromptResult> => {
			return await vscode.commands.executeCommand('rootasker.api.getPrompt', { promptId });
		},
		updatePrompt: async (promptId: string, updates: UpdatePromptData): Promise<UpdatePromptResult> => {
			return await vscode.commands.executeCommand('rootasker.api.updatePrompt', { promptId, updates });
		},
		deletePrompt: async (promptId: string): Promise<DeletePromptResult> => {
			return await vscode.commands.executeCommand('rootasker.api.deletePrompt', { promptId });
		},
		archivePrompt: async (promptId: string, archive: boolean): Promise<ArchivePromptResult> => {
			return await vscode.commands.executeCommand('rootasker.api.archivePrompt', { promptId, archive });
		},
		// getPromptUsage: async (promptId: string): Promise<PromptUsageResult> => {
		//   // TODO: Implement this command
		//   return { success: false, error: "Not implemented" };
		// },

		// getMcpServer: () => { // MCP Server REMOVED
		// 	return rooTaskerMcpServer;
		// }
	};

	return api;
}

// This method is called when your extension is deactivated
export async function deactivate() {
	outputChannel.appendLine("RooTasker extension deactivated");
	// REMOVED Voice Recorder Server stop logic
	// The scheduler service will be automatically cleaned up when the extension is deactivated
	// as its timers are registered as disposables in the extension context
}
