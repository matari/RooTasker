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
import { RooTaskerMcpServer } from "./mcp_server/RooTaskerMcpServer" // Added

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
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

	const provider = new ClineProvider(context, outputChannel, "sidebar")


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

	// Initialize and start the MCP Server
	const rooTaskerMcpServer = new RooTaskerMcpServer(context, schedulerService);
	rooTaskerMcpServer.start(); // This will attempt to register with a global MCP Hub or similar
	context.subscriptions.push(rooTaskerMcpServer);
	outputChannel.appendLine("RooTasker MCP Server initialized and started.");

	// Register API commands for MCP server (can also be used by other extensions or for testing)
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
}

// This method is called when your extension is deactivated
export async function deactivate() {
	outputChannel.appendLine("RooTasker extension deactivated")
	// Clean up MCP server manager
	
	// The scheduler service will be automatically cleaned up when the extension is deactivated
	// as its timers are registered as disposables in the extension context
}
