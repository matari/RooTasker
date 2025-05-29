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
import { migrateFromRooTasker } from "./utils/migrateFromRooTasker"
import { formatLanguage } from "./shared/language"
import { ClineProvider } from "./core/webview/ClineProvider"
import { CustomModesManager } from "./core/config/CustomModesManager" // Added
import { getAllModes } from "./shared/modes" // Added
import { Schedule } from "./services/scheduler/SchedulerService"
import { Prompt, BaseWatcher } from "./shared/ProjectTypes" // Added Prompt and BaseWatcher import
import { RooService } from "./services/scheduler/RooService"
import { WatcherService } from "./services/watchers/WatcherService"
import { ProjectStorageService } from "./core/storage/ProjectStorageService" 
import { PromptStorageService } from "./core/storage/PromptStorageService"; // Added for Prompts
// import { VoiceRecorderServer } from "./recorder_server/main"; // REMOVED for Voice Recorder
// import { RooPlusMcpServerSimple } from "./mcp_server/RooPlusMcpServerSimple" // MCP Server REMOVED
import {
	RooPlusAPI,
	CreateProjectData, ProjectResult, ListProjectsResult, GetProjectResult, UpdateProjectData, UpdateProjectResult, DeleteProjectResult,
	CreateScheduleData, ScheduleResult, ListSchedulesResult, GetScheduleResult, UpdateScheduleData, UpdateScheduleResult, DeleteScheduleResult, ToggleScheduleResult, RunScheduleResult, GetProjectSchedulesResult,
	CreateWatcherData, WatcherResult, ListWatchersResult, UpdateWatcherData, UpdateWatcherResult, DeleteWatcherResult, ToggleWatcherResult, GetProjectWatchersResult,
	CreatePromptData, PromptResult, ListPromptsResult, GetPromptResult, UpdatePromptData, UpdatePromptResult, DeletePromptResult, ArchivePromptResult // Added for Prompts
} from "./api/RooPlusAPI";

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
export async function activate(context: vscode.ExtensionContext): Promise<RooPlusAPI> {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel("Roo+")
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine("Roo+ extension activated")

	// Set a custom context variable for development mode
	// This is used to conditionally show the reload window button
	const isDevelopmentMode = context.extensionMode === vscode.ExtensionMode.Development
	await vscode.commands.executeCommand('setContext', 'rooPlusDevMode', isDevelopmentMode)
	
	// Migrate old settings to new
	await migrateSettings(context, outputChannel)
	
	// Migrate data from RooTasker extension
	try {
		outputChannel.appendLine("Attempting to migrate data from RooTasker extension...")
		const migrationSuccess = await migrateFromRooTasker(context, outputChannel)
		if (migrationSuccess) {
			outputChannel.appendLine("Successfully migrated data from RooTasker extension")
		} else {
			outputChannel.appendLine("No data migration was needed or RooTasker extension not found")
		}
	} catch (err) {
		outputChannel.appendLine(`Error during RooTasker data migration: ${err instanceof Error ? err.message : String(err)}`)
	}

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

	// Ensure CustomModesManager is available for modeDisplayName lookup
	const customModesManager = new CustomModesManager(context, async () => {
		// This callback is for when custom modes change, which might trigger a webview update.
		// For API commands, we just need to fetch current modes.
		// If provider instance is needed for this callback, it might need to be passed or accessed differently.
		// For now, assuming this callback is primarily for webview updates.
		// This will be properly handled when provider is initialized later.
	});
	context.subscriptions.push(customModesManager);
	
	// Initialize example prompts if none exist
	await promptStorageService.initializeExamplePrompts();
	
	// Ensure System Prompts (like meta-prompts for watchers) exist
	const { GlobalFileNames } = await import('./shared/globalFileNames'); // Import here for use
	const improverMetaPromptContent = `You are an AI assistant specializing in refining prompts. The content of the file being processed is a user's prompt.
Your task is to improve this prompt for clarity, conciseness, and effectiveness when used with an AI model.

Instructions:
1. Read the prompt content from the provided file.
2. Generate an improved version of the prompt.
3. Create a new file in the '../${GlobalFileNames.promptImprovementProcessedDirName}/' directory (relative to the input file's directory).
4. The new filename MUST be identical to the input filename.
5. The new file should contain ONLY the improved prompt text. Do not add any conversational wrappers, explanations, or markdown formatting unless it's part of the improved prompt itself.`;

	await promptStorageService.ensureSystemPrompt(
		GlobalFileNames.promptImproverMetaPromptId,
		"System: Prompt Improver Meta-Prompt",
		"Internal prompt used by Roo+ to instruct AI on how to improve user prompts.",
		improverMetaPromptContent,
		["system", "internal", "meta-prompt"]
	);
	outputChannel.appendLine("System prompts ensured.");


	// Ensure System Project and Internal Watchers are set up
	try {
		const systemProject = await projectStorageService.ensureSystemProjectExists();
		outputChannel.appendLine(`System project ensured: ${systemProject.id}`);

		const { GlobalFileNames } = await import('./shared/globalFileNames');
		const globalStoragePath = context.globalStorageUri.fsPath;
		const pendingImprovementDir = path.join(globalStoragePath, GlobalFileNames.systemPipelineDirName, GlobalFileNames.promptImprovementDirName, GlobalFileNames.promptImprovementPendingDirName);
		
		// Ensure the pending directory exists (WatcherService might not create it)
		try {
			await fs.mkdir(pendingImprovementDir, { recursive: true });
		} catch (mkdirError) {
			outputChannel.appendLine(`Error creating pending improvement directory ${pendingImprovementDir}: ${mkdirError}`);
		}


		const promptImproverWatcherName = "Internal Prompt Improver Watcher";
		const existingSystemWatchers = await projectStorageService.getWatchersForProject(systemProject.id);
		let promptImproverWatcher = existingSystemWatchers.find(w => w.name === promptImproverWatcherName);

		if (!promptImproverWatcher) {
			outputChannel.appendLine(`Creating ${promptImproverWatcherName}...`);
			// Meta-prompt is now stored as a system prompt, use its ID
			const watcherData: Omit<BaseWatcher, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> = { 
				// projectId is supplied by addWatcherToProject, modeDisplayName is also handled there
				name: promptImproverWatcherName,
				directoryPath: pendingImprovementDir,
				fileTypes: ["*.md"],
				promptSelectionType: 'saved',
				savedPromptId: GlobalFileNames.promptImproverMetaPromptId,
				prompt: '', // Content of prompt, not used if savedPromptId is set
				mode: "orchestrator", 
				active: true,
			};
			// addWatcherToProject will handle adding modeDisplayName if the mode is found
			promptImproverWatcher = await projectStorageService.addWatcherToProject(systemProject.id, watcherData);
			if (promptImproverWatcher) {
				outputChannel.appendLine(`${promptImproverWatcherName} created with ID: ${promptImproverWatcher.id}`);
				// WatcherService should pick this up on its initialization or next scan.
			} else {
				outputChannel.appendLine(`Failed to create ${promptImproverWatcherName}.`);
			}
		} else {
			outputChannel.appendLine(`${promptImproverWatcherName} already exists with ID: ${promptImproverWatcher.id}. Ensuring path and mode are up-to-date.`);
			let watcherNeedsUpdate = false;
			if (promptImproverWatcher.directoryPath !== pendingImprovementDir) {
				promptImproverWatcher.directoryPath = pendingImprovementDir;
				watcherNeedsUpdate = true;
				outputChannel.appendLine(`Scheduled update for directory path for ${promptImproverWatcherName}.`);
			}
			if (promptImproverWatcher.mode !== "orchestrator") {
				promptImproverWatcher.mode = "orchestrator";
				const availableModes = getAllModes(await customModesManager.getCustomModes());
				const orchestratorModeConfig = availableModes.find(m => m.slug === "orchestrator");
				if (orchestratorModeConfig && orchestratorModeConfig.name) {
					promptImproverWatcher.modeDisplayName = orchestratorModeConfig.name;
				} else {
					// This case should ideally not happen for a default mode like "orchestrator"
					promptImproverWatcher.modeDisplayName = "Orchestrator"; // Fallback
					outputChannel.appendLine(`Warning: Orchestrator mode configuration not found. Defaulting display name to "Orchestrator" for ${promptImproverWatcherName}.`);
				}
				watcherNeedsUpdate = true;
				outputChannel.appendLine(`Scheduled update for mode to "orchestrator" and display name to "${promptImproverWatcher.modeDisplayName}" for ${promptImproverWatcherName}.`);
			}

			if (watcherNeedsUpdate) {
				await projectStorageService.updateWatcherInProject(systemProject.id, promptImproverWatcher);
				outputChannel.appendLine(`Updated ${promptImproverWatcherName}.`);
			}
		}

		// Setup for the "processed" directory watcher (to update original prompt)
		const processedImprovementDir = path.join(globalStoragePath, GlobalFileNames.systemPipelineDirName, GlobalFileNames.promptImprovementDirName, GlobalFileNames.promptImprovementProcessedDirName);
		try {
			await fs.mkdir(processedImprovementDir, { recursive: true });
		} catch (mkdirError) {
			outputChannel.appendLine(`Error creating processed improvement directory ${processedImprovementDir}: ${mkdirError}`);
		}
		// This watcher will be handled by WatcherService directly.
		// Its task will be to read the processed file and update the original prompt.
		
		const promptProcessorWatcherName = "Internal Prompt Processor Watcher";
		let promptProcessorWatcher = existingSystemWatchers.find(w => w.name === promptProcessorWatcherName);

		if (!promptProcessorWatcher) {
			outputChannel.appendLine(`Creating ${promptProcessorWatcherName}...`);
			// This prompt is a placeholder. The actual logic will be an internal command.
			const metaPromptForProcessing = `INTERNAL_COMMAND:PROCESS_IMPROVED_PROMPT:[filepath]`; // This is correct

			const watcherDataProcessed: Omit<BaseWatcher, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> = {
				// projectId is supplied by addWatcherToProject, modeDisplayName is also handled there
				name: promptProcessorWatcherName,
				directoryPath: processedImprovementDir,
				fileTypes: ["*.md"],
				prompt: metaPromptForProcessing, 
				promptSelectionType: 'custom', // It uses the direct prompt string
				mode: "internal-command", 
				active: true,
			};
			promptProcessorWatcher = await projectStorageService.addWatcherToProject(systemProject.id, watcherDataProcessed);
			if (promptProcessorWatcher) {
				outputChannel.appendLine(`${promptProcessorWatcherName} created with ID: ${promptProcessorWatcher.id}`);
			} else {
				outputChannel.appendLine(`Failed to create ${promptProcessorWatcherName}.`);
			}
		} else {
			outputChannel.appendLine(`${promptProcessorWatcherName} already exists with ID: ${promptProcessorWatcher.id}. Ensuring path is up-to-date.`);
			if (promptProcessorWatcher.directoryPath !== processedImprovementDir) {
				promptProcessorWatcher.directoryPath = processedImprovementDir;
				await projectStorageService.updateWatcherInProject(systemProject.id, promptProcessorWatcher);
				outputChannel.appendLine(`Updated directory path for ${promptProcessorWatcherName}.`);
			}
		}

	} catch (systemSetupError) {
		outputChannel.appendLine(`Error during system project/watcher setup: ${systemSetupError}`);
	}

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
		vscode.commands.registerCommand("rooplus.reloadWindowDev", async () => {
			await vscode.commands.executeCommand("workbench.action.reloadWindow")
		})
	)

	// Register command to open the roo-cline extension (always register)
	context.subscriptions.push(
		vscode.commands.registerCommand("rooplus.openRooClineExtension", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.roo-cline-ActivityBar")
		})
	)

	// Register command to handle schedule updates and notify the webview
	context.subscriptions.push(
		vscode.commands.registerCommand("rooplus.schedulesUpdated", async () => {
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
	// const rooPlusMcpServer = new RooPlusMcpServerSimple(context);
	// await rooPlusMcpServer.start(); 
	// context.subscriptions.push(rooPlusMcpServer); 
	// outputChannel.appendLine("Roo+ SIMPLIFIED MCP Server initialized and started.");

	// Register API commands (can also be used by other extensions or for testing)
	// customModesManager is already initialized above.

	// The provider will be initialized later, so the callback for customModesManager
	// needs to be updated once provider is available, or handled such that it checks for provider.
	// For now, the existing callback structure is fine, as it will be re-assigned or provider will be checked.

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.createSchedule', async (scheduleData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { modeDisplayName?: string }) => {
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
				outputChannel.appendLine(`Error in rooplus.api.createSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.updateSchedule', async (args: { scheduleId: string, updates: Partial<Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'>> & { mode?: string, modeDisplayName?: string } }) => {
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
				outputChannel.appendLine(`Error in rooplus.api.updateSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.deleteSchedule', async (args: { scheduleId: string }) => {
			try {
				// schedulerService is already defined
				const success = await schedulerService.deleteScheduleProgrammatic(args.scheduleId);
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.deleteSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.toggleScheduleActive', async (args: { scheduleId: string, active: boolean }) => {
			try {
				// schedulerService is already defined
				await schedulerService.toggleScheduleActive(args.scheduleId, args.active);
				const updatedSchedule = schedulerService.getScheduleById(args.scheduleId);
				return { success: true, schedule: updatedSchedule };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.toggleScheduleActive: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.runScheduleNow', async (args: { scheduleId: string }) => {
			try {
				// schedulerService is already defined
				await schedulerService.runScheduleNow(args.scheduleId);
				return { success: true };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.runScheduleNow: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.getSchedule', (args: { scheduleId: string }) => {
			try {
				// schedulerService is already defined
				const schedule = schedulerService.getScheduleById(args.scheduleId);
				return { success: true, schedule: schedule };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.getSchedule: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.listSchedules', () => {
			try {
				// schedulerService is already defined
				const schedules = schedulerService.getAllSchedules();
				return { success: true, schedules: schedules };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.listSchedules: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	// Register Project API commands
	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.createProject', async (projectData: {
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
				outputChannel.appendLine(`Error in rooplus.api.createProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.getProject', async (args: { projectId: string }) => {
			try {
				const project = await projectStorageService.getProject(args.projectId);
				return { success: true, project: project };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.getProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.listProjects', async () => {
			try {
				const projects = await projectStorageService.getProjects();
				return { success: true, projects: projects };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.listProjects: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.updateProject', async (args: {
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
				outputChannel.appendLine(`Error in rooplus.api.updateProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.deleteProject', async (args: { projectId: string }) => {
			try {
				const success = await projectStorageService.deleteProject(args.projectId);
				if (success) {
					// Notify webview of project changes
					await provider.postMessageToWebview({ type: 'projectsUpdated' });
				}
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.deleteProject: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	// Register command to handle project updates and notify the webview (similar to schedulesUpdated)
	context.subscriptions.push(
		vscode.commands.registerCommand("rooplus.projectsUpdated", async () => {
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
		vscode.commands.registerCommand('rooplus.api.createWatcher', async (watcherData: {
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
				outputChannel.appendLine(`Error in rooplus.api.createWatcher: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.listWatchers', async (args: { projectId: string }) => {
			try {
				const watchers = await projectStorageService.getWatchersForProject(args.projectId);
				return { success: true, watchers: watchers };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.listWatchers: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.updateWatcher', async (args: {
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
				outputChannel.appendLine(`Error in rooplus.api.updateWatcher: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.deleteWatcher', async (args: { projectId: string, watcherId: string }) => {
			try {
				const success = await projectStorageService.deleteWatcherFromProject(args.projectId, args.watcherId);
				if (success) {
					await watcherService.deleteWatcher(args.watcherId); // Notify WatcherService to remove its file system watcher
					await provider.postMessageToWebview({ type: 'watchersUpdated' });
				}
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.deleteWatcher: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.toggleWatcherActive', async (args: { projectId: string, watcherId: string, active: boolean }) => {
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
				outputChannel.appendLine(`Error in rooplus.api.toggleWatcherActive: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	// Register command to handle watcher updates and notify the webview
	context.subscriptions.push(
		vscode.commands.registerCommand("rooplus.watchersUpdated", async () => {
			console.log("Watchers updated, sending message to webview");
			await provider.postMessageToWebview({ type: 'watchersUpdated' });
		})
	);

	// Register Prompt API commands
	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.createPrompt', async (promptData: CreatePromptData): Promise<PromptResult> => {
			try {
				const newPrompt = await promptStorageService.addPrompt(promptData);
				await provider.postMessageToWebview({ type: 'promptsUpdated' }); 
				return { success: true, data: newPrompt }; // Corrected: data is Prompt
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.createPrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.listPrompts', async (/* filters?: any */): Promise<ListPromptsResult> => {
			try {
				const promptsMetadata = await promptStorageService.getPromptsMetadata();
				const fullPrompts: Prompt[] = [];
				for (const meta of promptsMetadata) {
					// getPrompt already fetches content and returns full Prompt object
					const fullPrompt = await promptStorageService.getPrompt(meta.id);
					if (fullPrompt) {
						fullPrompts.push(fullPrompt);
					}
				}
				// TODO: Apply filters if any are passed and implemented
				return { success: true, data: { prompts: fullPrompts } };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.listPrompts: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.getPrompt', async (args: { promptId: string }): Promise<GetPromptResult> => {
			try {
				const prompt = await promptStorageService.getPrompt(args.promptId);
				return { success: true, data: { prompt } }; // Reverted to { prompt: ... }
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.getPrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.updatePrompt', async (args: { promptId: string, updates: UpdatePromptData }): Promise<UpdatePromptResult> => {
			try {
				const updatedPrompt = await promptStorageService.updatePrompt(args.promptId, args.updates);
				if (updatedPrompt) {
					await provider.postMessageToWebview({ type: 'promptsUpdated' });
				}
				return { success: !!updatedPrompt, data: { prompt: updatedPrompt } }; // Reverted to { prompt: ... }
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.updatePrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.deletePrompt', async (args: { promptId: string }): Promise<DeletePromptResult> => {
			try {
				const success = await promptStorageService.deletePrompt(args.promptId);
				if (success) {
					await provider.postMessageToWebview({ type: 'promptsUpdated' });
				}
				return { success };
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.deletePrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus.api.archivePrompt', async (args: { promptId: string, archive: boolean }): Promise<ArchivePromptResult> => {
			try {
				const updatedPrompt = await promptStorageService.archivePrompt(args.promptId, args.archive);
				if (updatedPrompt) {
					await provider.postMessageToWebview({ type: 'promptsUpdated' });
				}
				return { success: !!updatedPrompt, data: { prompt: updatedPrompt } }; // Reverted to { prompt: ... }
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus.api.archivePrompt: ${error instanceof Error ? error.message : String(error)}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);
	
	// Register command to handle prompt updates and notify the webview
	context.subscriptions.push(
		vscode.commands.registerCommand("rooplus.promptsUpdated", async () => {
			console.log("Prompts updated, sending message to webview");
			await provider.postMessageToWebview({ type: 'promptsUpdated' });
		})
	);

	// Register internal command for processing improved prompts
	context.subscriptions.push(
		vscode.commands.registerCommand('rooplus._internal.processImprovedPrompt', async (args: { filePath: string }) => {
			outputChannel.appendLine(`Internal command: Processing improved prompt file: ${args.filePath}`);
			try {
				const { GlobalFileNames } = await import('./shared/globalFileNames');
				const globalStoragePath = context.globalStorageUri.fsPath;
				const pendingDir = path.join(globalStoragePath, GlobalFileNames.systemPipelineDirName, GlobalFileNames.promptImprovementDirName, GlobalFileNames.promptImprovementPendingDirName);
				
				const fileName = path.basename(args.filePath);
				// Updated Filename expected format: [promptId]_v[version].improve.md
				const match = fileName.match(/^([a-f0-9-]+(?:-[a-f0-9]+)*)_v(\d+)\.improve\.md$/);
				if (!match) {
					outputChannel.appendLine(`Error: Could not parse promptId and version from filename: ${fileName}. Expected format: [uuid]_v[number].improve.md`);
					return { success: false, error: "Invalid filename format for processed prompt." };
				}
				const promptId = match[1];
				// const originalVersion = parseInt(match[2], 10); // Original version that was sent for improvement

				const improvedContent = await fs.readFile(args.filePath, 'utf-8');

				// Update the prompt in storage - this will create a new version
				const updatedPrompt = await promptStorageService.updatePrompt(promptId, { content: improvedContent });

				if (updatedPrompt) {
					outputChannel.appendLine(`Successfully updated prompt ${promptId} with improved content to version ${updatedPrompt.currentVersion}.`);
					await provider.postMessageToWebview({ type: 'promptsUpdated' });

					// Clean up files
					const originalPendingFile = path.join(pendingDir, fileName); // Name in pending was same as in processed
					try {
						await fs.unlink(args.filePath); // Delete from processed
						outputChannel.appendLine(`Deleted processed file: ${args.filePath}`);
						await fs.unlink(originalPendingFile); // Delete from pending
						outputChannel.appendLine(`Deleted pending file: ${originalPendingFile}`);
					} catch (cleanupError) {
					outputChannel.appendLine(`Error during cleanup of prompt improvement files: ${cleanupError}`);
					}
					return { success: true, promptId: updatedPrompt.id, newVersion: updatedPrompt.currentVersion };
				} else {
					outputChannel.appendLine(`Error: Failed to update prompt ${promptId} in storage.`);
					return { success: false, error: "Failed to update prompt in storage." };
				}
			} catch (error) {
				outputChannel.appendLine(`Error in rooplus._internal.processImprovedPrompt: ${error}`);
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		})
	);

	// Create the API object to be returned
	const api: RooPlusAPI = {
		createProject: async (data: CreateProjectData): Promise<ProjectResult> => {
			return await vscode.commands.executeCommand('rooplus.api.createProject', data);
		},
		listProjects: async (): Promise<ListProjectsResult> => {
			return await vscode.commands.executeCommand('rooplus.api.listProjects');
		},
		getProject: async (projectId: string): Promise<GetProjectResult> => {
			return await vscode.commands.executeCommand('rooplus.api.getProject', { projectId });
		},
		updateProject: async (projectId: string, updates: UpdateProjectData): Promise<UpdateProjectResult> => {
			return await vscode.commands.executeCommand('rooplus.api.updateProject', { projectId, updates });
		},
		deleteProject: async (projectId: string): Promise<DeleteProjectResult> => {
			return await vscode.commands.executeCommand('rooplus.api.deleteProject', { projectId });
		},
		getProjectSchedules: async (projectId: string): Promise<GetProjectSchedulesResult> => {
			// Assuming 'rooplus.api.listSchedules' can take a projectId or we need a new command
			// For now, let's assume listSchedules is global and we filter, or a specific command exists.
			// The MCP tool GetProjectSchedulesTool calls 'rooplus.api.listSchedules' and filters.
			// Let's make a dedicated command for this for a cleaner API.
			// If 'rooplus.api.listSchedules' is already project-specific, this is fine.
			// Based on current command registration, 'listSchedules' is global.
			// We should add a new command 'rooplus.api.getProjectSchedules'
			// For now, this will mimic the MCP tool's behavior if a direct command isn't available.
			const allSchedulesResult: ListSchedulesResult = await vscode.commands.executeCommand('rooplus.api.listSchedules');
			if (allSchedulesResult.success && allSchedulesResult.data?.schedules) {
				const projectSchedules = allSchedulesResult.data.schedules.filter(s => s.projectId === projectId);
				return { success: true, data: { schedules: projectSchedules } };
			}
			return { success: false, error: allSchedulesResult.error || "Failed to retrieve project schedules" };
		},
		getProjectWatchers: async (projectId: string): Promise<GetProjectWatchersResult> => {
			return await vscode.commands.executeCommand('rooplus.api.listWatchers', { projectId });
		},
		createSchedule: async (data: CreateScheduleData): Promise<ScheduleResult> => {
			return await vscode.commands.executeCommand('rooplus.api.createSchedule', data);
		},
		listSchedules: async (): Promise<ListSchedulesResult> => { // This lists ALL schedules
			return await vscode.commands.executeCommand('rooplus.api.listSchedules');
		},
		getSchedule: async (scheduleId: string): Promise<GetScheduleResult> => {
			return await vscode.commands.executeCommand('rooplus.api.getSchedule', { scheduleId });
		},
		updateSchedule: async (scheduleId: string, updates: UpdateScheduleData): Promise<UpdateScheduleResult> => {
			return await vscode.commands.executeCommand('rooplus.api.updateSchedule', { scheduleId, updates });
		},
		deleteSchedule: async (scheduleId: string): Promise<DeleteScheduleResult> => {
			return await vscode.commands.executeCommand('rooplus.api.deleteSchedule', { scheduleId });
		},
		toggleScheduleActive: async (scheduleId: string, active: boolean): Promise<ToggleScheduleResult> => {
			return await vscode.commands.executeCommand('rooplus.api.toggleScheduleActive', { scheduleId, active });
		},
		runScheduleNow: async (scheduleId: string): Promise<RunScheduleResult> => {
			return await vscode.commands.executeCommand('rooplus.api.runScheduleNow', { scheduleId });
		},
		createWatcher: async (data: CreateWatcherData): Promise<WatcherResult> => {
			return await vscode.commands.executeCommand('rooplus.api.createWatcher', data);
		},
		updateWatcher: async (projectId: string, watcherId: string, updates: UpdateWatcherData): Promise<UpdateWatcherResult> => {
			return await vscode.commands.executeCommand('rooplus.api.updateWatcher', { projectId, watcherId, updates });
		},
		deleteWatcher: async (projectId: string, watcherId: string): Promise<DeleteWatcherResult> => {
			return await vscode.commands.executeCommand('rooplus.api.deleteWatcher', { projectId, watcherId });
		},
		toggleWatcherActive: async (projectId: string, watcherId: string, active: boolean): Promise<ToggleWatcherResult> => {
			return await vscode.commands.executeCommand('rooplus.api.toggleWatcherActive', { projectId, watcherId, active });
		},

		// Prompt methods
		createPrompt: async (data: CreatePromptData): Promise<PromptResult> => {
			return await vscode.commands.executeCommand('rooplus.api.createPrompt', data);
		},
		listPrompts: async (filters?: any): Promise<ListPromptsResult> => {
			return await vscode.commands.executeCommand('rooplus.api.listPrompts', filters);
		},
		getPrompt: async (promptId: string): Promise<GetPromptResult> => {
			return await vscode.commands.executeCommand('rooplus.api.getPrompt', { promptId });
		},
		updatePrompt: async (promptId: string, updates: UpdatePromptData): Promise<UpdatePromptResult> => {
			return await vscode.commands.executeCommand('rooplus.api.updatePrompt', { promptId, updates });
		},
		deletePrompt: async (promptId: string): Promise<DeletePromptResult> => {
			return await vscode.commands.executeCommand('rooplus.api.deletePrompt', { promptId });
		},
		archivePrompt: async (promptId: string, archive: boolean): Promise<ArchivePromptResult> => {
			return await vscode.commands.executeCommand('rooplus.api.archivePrompt', { promptId, archive });
		},
		// getPromptUsage: async (promptId: string): Promise<PromptUsageResult> => {
		//   // TODO: Implement this command
		//   return { success: false, error: "Not implemented" };
		// },

		// getMcpServer: () => { // MCP Server REMOVED
		// 	return rooPlusMcpServer;
		// }
	};

	return api;
}

// This method is called when your extension is deactivated
export async function deactivate() {
	outputChannel.appendLine("Roo+ extension deactivated");
	// REMOVED Voice Recorder Server stop logic
	// The scheduler service will be automatically cleaned up when the extension is deactivated
	// as its timers are registered as disposables in the extension context
}
