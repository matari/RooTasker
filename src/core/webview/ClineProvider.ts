import os from "os"
import * as path from "path"
import fs from "fs/promises"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import axios from "axios"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"

import { GlobalState, ProviderSettings, RooCodeSettings } from "../../schemas"
import { Project, BaseSchedule, BaseWatcher } from "../../shared/ProjectTypes" // Corrected import path
import { t } from "../../i18n"
// Remove setPanel import since it's missing
import {
	ProviderSettings as ApiConfiguration,
	ProviderName as ApiProvider,
	ModelInfo,
} from "../../schemas"
import { GlobalFileNames } from "../../shared/globalFileNames"
import { ExtensionMessage } from "../../shared/ExtensionMessage"
import { Mode, PromptComponent, defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { formatLanguage } from "../../shared/language"

// Constants to replace missing imports
const TERMINAL_SHELL_INTEGRATION_TIMEOUT = 30000; // Default timeout in milliseconds
const experimentDefault = { search_and_replace: false, insert_content: false, powerSteering: false };
import { fileExistsAtPath } from "../../utils/fs"
import { ContextProxy } from "../config/ContextProxy"
import { ProviderSettingsManager } from "../config/ProviderSettingsManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { ProjectStorageService } from "../storage/ProjectStorageService";
import { PromptStorageService } from "../storage/PromptStorageService"; // Added for Prompts
// import { VoiceRecorderServer } from "../../recorder_server/main"; // REMOVED Recorder
import { ACTION_NAMES } from "../CodeActionProvider"
import { Cline, ClineOptions } from "../Cline"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { getWorkspacePath } from "../../utils/path"
import { webviewMessageHandler } from "./webviewMessageHandler"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { HistoryItem } from "../../schemas"


export type ClineProviderEvents = {
	clineCreated: [cline: Cline]
}

export class ClineProvider extends EventEmitter<ClineProviderEvents> implements vscode.WebviewViewProvider {
	public static readonly sideBarId = "rooplus.SidebarProvider" 
	public static readonly tabPanelId = "rooplus.TabPanelProvider"
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private clineStack: Cline[] = []
	private _workspaceTracker?: any 
	public get workspaceTracker(): any | undefined {
		return this._workspaceTracker
	}
	protected mcpHub?: any 

	public isViewLaunched = false
	public settingsImportedAt?: number
	public readonly latestAnnouncementId = "apr-09-2025" 
	public readonly contextProxy: ContextProxy
	public readonly providerSettingsManager: ProviderSettingsManager
	public readonly customModesManager: CustomModesManager
	public readonly projectStorageService: ProjectStorageService;
	public readonly promptStorageService: PromptStorageService; // Added for Prompts
	// public readonly voiceRecorderServer?: VoiceRecorderServer; // REMOVED Recorder

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly renderContext: "sidebar" | "editor" = "sidebar"
		// voiceRecorderServerInstance?: VoiceRecorderServer // REMOVED Recorder
	) {
		super()

		this.log("ClineProvider instantiated")
		this.contextProxy = new ContextProxy(context)
		ClineProvider.activeInstances.add(this)
		this.providerSettingsManager = new ProviderSettingsManager(this.context)
		// this.voiceRecorderServer = voiceRecorderServerInstance; // REMOVED Recorder

		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})

		this.projectStorageService = new ProjectStorageService(this.context); 
		this.promptStorageService = new PromptStorageService(this.context); // Added for Prompts
	}

	async addClineToStack(cline: Cline) {
		console.log(`[subtasks] adding task ${cline.taskId}.${cline.instanceId} to stack`)
		this.clineStack.push(cline)
		const state = await this.getState()
		if (!state || typeof state.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
	}

	async removeClineFromStack() {
		if (this.clineStack.length === 0) {
			return
		}
		var cline = this.clineStack.pop()
		if (cline) {
			console.log(`[subtasks] removing task ${cline.taskId}.${cline.instanceId} from stack`)
			try {
				await cline.abortTask(true)
			} catch (e) {
				this.log(
					`[subtasks] encountered error while aborting task ${cline.taskId}.${cline.instanceId}: ${e.message}`,
				)
			}
			cline = undefined
		}
	}

	getCurrentCline(): Cline | undefined {
		if (this.clineStack.length === 0) {
			return undefined
		}
		return this.clineStack[this.clineStack.length - 1]
	}

	getClineStackSize(): number {
		return this.clineStack.length
	}

	public getCurrentTaskStack(): string[] {
		return this.clineStack.map((cline) => cline.taskId)
	}

	async finishSubTask(lastMessage?: string) {
		console.log(`[subtasks] finishing subtask ${lastMessage}`)
		await this.removeClineFromStack()
		if (lastMessage && this.getCurrentCline()) {
			this.getCurrentCline()?.resumePausedTask(lastMessage)
		}
	}

	async dispose() {
		this.log("Disposing ClineProvider...")
		await this.removeClineFromStack()
		this.log("Cleared task")

		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.log("Disposed webview")
		}

		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this._workspaceTracker = undefined
		this.mcpHub = undefined
		this.customModesManager?.dispose()
		this.log("Disposed all disposables")
		ClineProvider.activeInstances.delete(this)
	}

	public static getVisibleInstance(): ClineProvider | undefined {
		return Array.from(this.activeInstances).reverse().find((instance: ClineProvider) => instance.view?.visible === true)
	}

	public static async getInstance(): Promise<ClineProvider | undefined> {
		let visibleProvider = ClineProvider.getVisibleInstance()
		if (!visibleProvider) {
			await vscode.commands.executeCommand("rooplus.SidebarProvider.focus")
			await delay(100)
			visibleProvider = ClineProvider.getVisibleInstance()
		}
		if (!visibleProvider) {
			return
		}
		return visibleProvider
	}

	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return false
		}
		if (visibleProvider.getCurrentCline()) {
			return true
		}
		return false
	}

	public static async handleCodeAction(
		command: string,
		promptType: keyof typeof ACTION_NAMES,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}
		const { customSupportPrompts } = await visibleProvider.getState()
		const prompt = `${promptType}: ${JSON.stringify(params)}`
		if (command.endsWith("addToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})
			return
		}
		if (visibleProvider.getCurrentCline() && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text: prompt })
			return
		}
		await visibleProvider.initClineWithTask(prompt)
	}

	public static async handleTerminalAction(
		command: string,
		promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}
		const { customSupportPrompts } = await visibleProvider.getState()
		const prompt = `${promptType}: ${JSON.stringify(params)}`
		if (command.endsWith("AddToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})
			return
		}
		if (visibleProvider.getCurrentCline() && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: prompt,
			})
			return
		}
		await visibleProvider.initClineWithTask(prompt)
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.log("Resolving webview view")
		if (!this.contextProxy.isInitialized) {
			await this.contextProxy.initialize()
		}
		
		// Initialize MCP Hub from Roo Cline extension
		await this.initializeMcpHub()
		this.view = webviewView
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.contextProxy.extensionUri],
		}
		webviewView.webview.html =
			this.contextProxy.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: this.getHtmlContent(webviewView.webview)
		this.setWebviewMessageListener(webviewView.webview)
		if ("onDidChangeViewState" in webviewView) {
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			webviewView.onDidChangeVisibility(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		}
		webviewView.onDidDispose(
			async () => {
				await this.dispose()
			},
			null,
			this.disposables,
		)
		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					await this.postMessageToWebview({ type: "theme", text: JSON.stringify({ kind: "dark" }) })
				}
			},
			null,
			this.disposables,
		)
		await this.removeClineFromStack()
		const currentWorkspacePath = getWorkspacePath();
		if (currentWorkspacePath) {
		  const migratedProject = await this.projectStorageService.migrateFromWorkspaceStorageIfNeeded(currentWorkspacePath);
		  if (migratedProject) {
		    this.log(`Migration resulted in project: ${migratedProject.name} (ID: ${migratedProject.id}). Setting as active.`);
		    await this.contextProxy.setValue("activeProjectId", migratedProject.id);
		    // No need to call postStateToWebview here, as resolveWebviewView will eventually lead to it
		          // or the initial state sent will include this activeProjectId.
		  }
		}
		this.log("Webview view resolved")
}

	public async initClineWithSubTask(parent: Cline, task?: string, images?: string[]) {
		return this.initClineWithTask(task, images, parent)
	}

	public async initClineWithTask(
		task?: string,
		images?: string[],
		parentTask?: Cline,
		options: Partial<
			Pick<
				ClineOptions,
				| "customInstructions"
				| "enableDiff"
				| "enableCheckpoints"
				| "checkpointStorage"
				| "fuzzyMatchThreshold"
				| "consecutiveMistakeLimit"
				| "experiments"
			>
		> = {},
	) {
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled: enableDiff,
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()
		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")
		const cline = new Cline({
			provider: this,
			apiConfiguration,
			customInstructions: effectiveInstructions,
			enableDiff,
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			task,
			images,
			experiments,
			rootTask: this.clineStack.length > 0 ? this.clineStack[0] : undefined,
			parentTask,
			taskNumber: this.clineStack.length + 1,
			onCreated: (cline) => this.emit("clineCreated", cline),
			...options,
		})
		await this.addClineToStack(cline)
		this.log(
			`[subtasks] ${cline.parentTask ? "child" : "parent"} task ${cline.taskId}.${cline.instanceId} instantiated`,
		)
		return cline
	}

	public async initClineWithHistoryItem(historyItem: HistoryItem & { rootTask?: Cline; parentTask?: Cline }) {
		await this.removeClineFromStack()
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled: enableDiff,
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()
		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")
		const taskId = historyItem.id
		const globalStorageDir = this.contextProxy.globalStorageUri.fsPath
		const workspaceDir = this.cwd
		const checkpoints: Pick<ClineOptions, "enableCheckpoints" | "checkpointStorage"> = {
			enableCheckpoints,
			checkpointStorage,
		}
		const cline = new Cline({
			provider: this,
			apiConfiguration,
			customInstructions: effectiveInstructions,
			enableDiff,
			...checkpoints,
			fuzzyMatchThreshold,
			historyItem,
			experiments,
			rootTask: historyItem.rootTask,
			parentTask: historyItem.parentTask,
			taskNumber: historyItem.number,
			onCreated: (cline) => this.emit("clineCreated", cline),
		})
		await this.addClineToStack(cline)
		this.log(
			`[subtasks] ${cline.parentTask ? "child" : "parent"} task ${cline.taskId}.${cline.instanceId} instantiated`,
		)
		return cline
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		const localPort = "5173"
		const localServerUrl = `localhost:${localPort}`
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.hmr_not_running"))
			return this.getHtmlContent(webview)
		}
		const nonce = getNonce()
		const stylesUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["node_modules", "@vscode", "codicons", "dist", "codicon.css"])
		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])
		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`
		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`
		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} data:`,
			`script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src https://* https://*.posthog.com ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort} ws://localhost:8090`,
			`media-src ${webview.cspSource} data: blob:`, // Allow media from webview source, data, and blob
			"microphone *", // Allow microphone access from any source (consider making more specific if possible)
		]
		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<script nonce="${nonce}">
						window.IMAGES_BASE_URI = "${imagesUri}"
					</script>
					<title>Roo+</title>
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const stylesUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const scriptUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.js"])
		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, ["node_modules", "@vscode", "codicons", "dist", "codicon.css"])
		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])
		const nonce = getNonce()
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}' https://us-assets.i.posthog.com; connect-src https://openrouter.ai https://api.requesty.ai https://us.i.posthog.com https://us-assets.i.posthog.com ws://localhost:8090; media-src ${webview.cspSource} data: blob:; microphone *;">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
			<script nonce="${nonce}">
				window.IMAGES_BASE_URI = "${imagesUri}"
			</script>
            <title>Roo+</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	private setWebviewMessageListener(webview: vscode.Webview) {
		const onReceiveMessage = async (message: WebviewMessage) => webviewMessageHandler(this, message)
		webview.onDidReceiveMessage(onReceiveMessage, null, this.disposables)
	}

	public async handleModeSwitch(newMode: Mode) {
		const cline = this.getCurrentCline()
		if (cline) {
			cline.emit("taskModeSwitched", cline.taskId, newMode)
		}
		await this.updateGlobalState("mode", newMode)
		const savedConfigId = await this.providerSettingsManager.getModeConfigId(newMode)
		const listApiConfig = await this.providerSettingsManager.listConfig()
		await this.updateGlobalState("listApiConfigMeta", listApiConfig)
		if (savedConfigId) {
			const config = listApiConfig?.find((c) => c.id === savedConfigId)
			if (config?.name) {
				const apiConfig = await this.providerSettingsManager.loadConfig(config.name)
				await Promise.all([
					this.updateGlobalState("currentApiConfigName", config.name),
					this.updateApiConfiguration(apiConfig),
				])
			}
		} else {
			const currentApiConfigName = this.getGlobalState("currentApiConfigName")
			if (currentApiConfigName) {
				const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
				if (config?.id) {
					await this.providerSettingsManager.setModeConfig(newMode, config.id)
				}
			}
		}
		await this.postStateToWebview()
	}

	async updateApiConfiguration(providerSettings: ProviderSettings) {
		const { mode } = await this.getState()
		if (mode) {
			const currentApiConfigName = this.getGlobalState("currentApiConfigName")
			const listApiConfig = await this.providerSettingsManager.listConfig()
			const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
			if (config?.id) {
				await this.providerSettingsManager.setModeConfig(mode, config.id)
			}
		}
		await this.contextProxy.setProviderSettings(providerSettings)
	}

	async cancelTask() {
		const cline = this.getCurrentCline()
		if (!cline) {
			return
		}
		console.log(`[subtasks] cancelling task ${cline.taskId}.${cline.instanceId}`)
		const { historyItem } = await this.getTaskWithId(cline.taskId)
		const rootTask = cline.rootTask
		const parentTask = cline.parentTask
		cline.abortTask()
		await pWaitFor(
			() =>
				this.getCurrentCline()! === undefined ||
				this.getCurrentCline()!.isStreaming === false ||
				this.getCurrentCline()!.didFinishAbortingStream ||
				this.getCurrentCline()!.isWaitingForFirstChunk,
			{
				timeout: 3_000,
			},
		).catch(() => {
			console.error("Failed to abort task")
		})
		if (this.getCurrentCline()) {
			this.getCurrentCline()!.abandoned = true
		}
		await this.initClineWithHistoryItem({ ...historyItem, rootTask, parentTask })
	}

	async updateCustomInstructions(instructions?: string) {
		await this.updateGlobalState("customInstructions", instructions || undefined)
		if (this.getCurrentCline()) {
			this.getCurrentCline()!.customInstructions = instructions || undefined
		}
		await this.postStateToWebview()
	}

	async ensureMcpServersDirectoryExists(): Promise<string> {
		let mcpServersDir: string
		if (process.platform === "win32") {
			mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", "RooPlus", "MCP")
		} else if (process.platform === "darwin") {
			mcpServersDir = path.join(os.homedir(), "Documents", "RooPlus", "MCP")
		} else {
			mcpServersDir = path.join(os.homedir(), ".local", "share", "RooPlus", "MCP")
		}
		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			return path.join(os.homedir(), ".rooplus", "mcp")
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const { getSettingsDirectoryPath } = await import("../../shared/storagePathManager")
		const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
		return getSettingsDirectoryPath(globalStoragePath)
	}

	private async ensureCacheDirectoryExists() {
		const { getCacheDirectoryPath } = await import("../../shared/storagePathManager")
		const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
		return getCacheDirectoryPath(globalStoragePath)
	}

	async writeModelsToCache<T>(filename: string, data: T) {
		const cacheDir = await this.ensureCacheDirectoryExists()
		await fs.writeFile(path.join(cacheDir, filename), JSON.stringify(data))
	}

	async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined> {
		const filePath = path.join(await this.ensureCacheDirectoryExists(), filename)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			const fileContents = await fs.readFile(filePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
	}

	async handleOpenRouterCallback(code: string) {
		let { apiConfiguration, currentApiConfigName } = await this.getState()
		let apiKey: string
		try {
			const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1"
			const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"
			const response = await axios.post(`${baseUrlDomain}/api/v1/auth/keys`, { code })
			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			this.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}
		const newConfiguration: ApiConfiguration = {
			...apiConfiguration,
			apiProvider: "openrouter",
			openRouterApiKey: apiKey,
			openRouterModelId: apiConfiguration?.openRouterModelId,
			openRouterModelInfo: apiConfiguration?.openRouterModelInfo,
		}
		await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
	}

	async handleGlamaCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code })
			if (response.data && response.data.apiKey) {
				apiKey = response.data.apiKey
			} else {
				throw new Error("Invalid response from Glama API")
			}
		} catch (error) {
			this.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}
		const { apiConfiguration, currentApiConfigName } = await this.getState()
		const newConfiguration: ApiConfiguration = {
			...apiConfiguration,
			apiProvider: "glama",
			glamaApiKey: apiKey,
			glamaModelId: apiConfiguration?.glamaModelId,
			glamaModelInfo: apiConfiguration?.glamaModelInfo,
		}
		await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
	}

	async handleRequestyCallback(code: string) {
		let { apiConfiguration, currentApiConfigName } = await this.getState()
		const newConfiguration: ApiConfiguration = {
			...apiConfiguration,
			apiProvider: "requesty",
			requestyApiKey: code,
			requestyModelId: apiConfiguration?.requestyModelId,
			requestyModelInfo: apiConfiguration?.requestyModelInfo,
		}
		await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
	}

	async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration) {
		try {
			await this.providerSettingsManager.saveConfig(configName, apiConfiguration)
			const listApiConfig = await this.providerSettingsManager.listConfig()
			await Promise.all([
				this.updateGlobalState("listApiConfigMeta", listApiConfig),
				this.updateApiConfiguration(apiConfiguration),
				this.updateGlobalState("currentApiConfigName", configName),
			])
			await this.postStateToWebview()
		} catch (error) {
			this.log(
				`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			vscode.window.showErrorMessage(t("common:errors.create_api_config"))
		}
	}

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = this.getGlobalState("taskHistory") ?? []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const { getTaskDirectoryPath } = await import("../../shared/storagePathManager")
			const globalStoragePath = this.contextProxy.globalStorageUri.fsPath
			const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			}
		}
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.getCurrentCline()?.taskId) {
			const { historyItem } = await this.getTaskWithId(id)
			await this.initClineWithHistoryItem(historyItem) 
		}
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		this.log(`Export task ${id} requested but downloadTask function is not available`)
	}

	async deleteTaskWithId(id: string) {
		try {
			const { taskDirPath } = await this.getTaskWithId(id)
			if (id === this.getCurrentCline()?.taskId) {
				await this.finishSubTask(t("common:tasks.deleted"))
			}
			await this.deleteTaskFromState(id)
			try {
				await fs.rm(taskDirPath, { recursive: true, force: true })
				console.log(`[deleteTaskWithId${id}] removed task directory`)
			} catch (error) {
				console.error(
					`[deleteTaskWithId${id}] failed to remove task directory: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		} catch (error) {
			if (error instanceof Error && error.message === "Task not found") {
				await this.deleteTaskFromState(id)
				return
			}
			throw error
		}
	}

	async deleteTaskFromState(id: string) {
		const taskHistory = this.getGlobalState("taskHistory") ?? []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })
	}

	async getStateToPostToWebview(): Promise<ExtensionMessage['state']> { // Added explicit return type
		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			alwaysAllowExecute,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
			soundEnabled,
			ttsEnabled,
			ttsSpeed,
			diffEnabled,
			enableCheckpoints,
			checkpointStorage,
			taskHistory,
			soundVolume,
			browserViewportSize,
			screenshotQuality,
			remoteBrowserHost,
			remoteBrowserEnabled,
			cachedChromeHostUrl,
			writeDelayMs,
			terminalOutputLineLimit,
			terminalShellIntegrationTimeout,
			fuzzyMatchThreshold,
			mcpEnabled,
			// enableMcpServerCreation, // Already removed in previous step, but checking destructuring
			alwaysApproveResubmit,
			requestDelaySeconds,
			rateLimitSeconds,
			currentApiConfigName,
			listApiConfigMeta,
			pinnedApiConfigs,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			experiments,
			maxOpenTabsContext,
			maxWorkspaceFiles,
			browserToolEnabled,
			telemetrySetting,
			showRooIgnoredFiles,
			language,
			maxReadFileLine,
		} = await this.getState();

		// Fetch project data
		const projects = await this.projectStorageService.getProjects();
		const projectSchedules: Record<string, BaseSchedule[]> = {}; // Explicit type
		const projectWatchers: Record<string, BaseWatcher[]> = {}; // Explicit type

		for (const project of projects) {
			projectSchedules[project.id] = await this.projectStorageService.getSchedulesForProject(project.id);
			projectWatchers[project.id] = await this.projectStorageService.getWatchersForProject(project.id);
		}
		const activeProjectId = this.contextProxy.getValue("activeProjectId") || null;

		const telemetryKey = process.env.POSTHOG_API_KEY;
		const machineId = vscode.env.machineId;
		const allowedCommands = vscode.workspace.getConfiguration("roo-cline").get<string[]>("allowedCommands") || [];
		const cwd = this.cwd;

		const webview = this.view?.webview;
		let rooPlusLiteSvgUri = "";
		let rooPlusDarkSvgUri = "";

		if (webview && this.contextProxy.extensionUri) {
			rooPlusLiteSvgUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "icons", "RooPlus_lite.png"]).toString();
			rooPlusDarkSvgUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "icons", "RooPlus_dark.png"]).toString();
		}

		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowReadOnlyOutsideWorkspace: alwaysAllowReadOnlyOutsideWorkspace ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowWriteOutsideWorkspace: alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			alwaysAllowSubtasks: alwaysAllowSubtasks ?? false,
			uriScheme: vscode.env.uriScheme,
			currentTaskItem: this.getCurrentCline()?.taskId
				? (taskHistory || []).find((item: HistoryItem) => item.id === this.getCurrentCline()?.taskId)
				: undefined,
			clineMessages: this.getCurrentCline()?.clineMessages || [],
			taskHistory: (taskHistory || [])
				.filter((item: HistoryItem) => item.ts && item.task)
				.sort((a: HistoryItem, b: HistoryItem) => b.ts - a.ts),
			soundEnabled: soundEnabled ?? false,
			ttsEnabled: ttsEnabled ?? false,
			ttsSpeed: ttsSpeed ?? 1.0,
			diffEnabled: diffEnabled ?? true,
			enableCheckpoints: enableCheckpoints ?? true,
			checkpointStorage: checkpointStorage ?? "task",
			shouldShowAnnouncement:
				telemetrySetting !== "unset" && lastShownAnnouncementId !== this.latestAnnouncementId,
			allowedCommands,
			soundVolume: soundVolume ?? 0.5,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			remoteBrowserHost,
			remoteBrowserEnabled: remoteBrowserEnabled ?? false,
			// cachedChromeHostUrl: cachedChromeHostUrl, // Removed as it's not in ExtensionState
			writeDelayMs: writeDelayMs ?? 1000,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			terminalShellIntegrationTimeout: terminalShellIntegrationTimeout ?? TERMINAL_SHELL_INTEGRATION_TIMEOUT,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			mcpEnabled: mcpEnabled ?? true,
			// enableMcpServerCreation: enableMcpServerCreation ?? true, // REMOVED from returned state
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: requestDelaySeconds ?? 10,
			// rateLimitSeconds: rateLimitSeconds ?? 0, // Removed as it's not in ExtensionState
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			pinnedApiConfigs: pinnedApiConfigs ?? {},
			mode: mode ?? defaultModeSlug,
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			customModes: await this.customModesManager.getCustomModes(),
			experiments: experiments ?? experimentDefault,
			// mcpServers: this.mcpHub?.getAllServers() ?? [], // Removed as it's not in ExtensionState
			maxOpenTabsContext: maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: maxWorkspaceFiles ?? 200,
			cwd,
			browserToolEnabled: browserToolEnabled ?? true,
			telemetrySetting,
			telemetryKey,
			machineId,
			showRooIgnoredFiles: showRooIgnoredFiles ?? true,
			language,
			renderContext: this.renderContext,
			maxReadFileLine: maxReadFileLine ?? 500,
			settingsImportedAt: this.settingsImportedAt,
			rootaskerLiteSvgUri: rooPlusLiteSvgUri,
			rootaskerDarkSvgUri: rooPlusDarkSvgUri,
			// Add project data
			projects,
			projectSchedules,
			projectWatchers,
			activeProjectId,
		}
	}

	async getState() {
		const stateValues = this.contextProxy.getValues()
		const customModes = await this.customModesManager.getCustomModes()
		const apiProvider: ApiProvider = stateValues.apiProvider ? stateValues.apiProvider : "anthropic"
		const providerSettings = this.contextProxy.getProviderSettings()
		if (!providerSettings.apiProvider) {
			providerSettings.apiProvider = apiProvider
		}
		return {
			apiConfiguration: providerSettings,
			lastShownAnnouncementId: stateValues.lastShownAnnouncementId,
			customInstructions: stateValues.customInstructions,
			alwaysAllowReadOnly: stateValues.alwaysAllowReadOnly ?? false,
			alwaysAllowReadOnlyOutsideWorkspace: stateValues.alwaysAllowReadOnlyOutsideWorkspace ?? false,
			alwaysAllowWrite: stateValues.alwaysAllowWrite ?? false,
			alwaysAllowWriteOutsideWorkspace: stateValues.alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowExecute: stateValues.alwaysAllowExecute ?? false,
			alwaysAllowBrowser: stateValues.alwaysAllowBrowser ?? false,
			alwaysAllowMcp: stateValues.alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: stateValues.alwaysAllowModeSwitch ?? false,
			alwaysAllowSubtasks: stateValues.alwaysAllowSubtasks ?? false,
			taskHistory: stateValues.taskHistory,
			allowedCommands: stateValues.allowedCommands,
			soundEnabled: stateValues.soundEnabled ?? false,
			ttsEnabled: stateValues.ttsEnabled ?? false,
			ttsSpeed: stateValues.ttsSpeed ?? 1.0,
			diffEnabled: stateValues.diffEnabled ?? true,
			enableCheckpoints: stateValues.enableCheckpoints ?? true,
			checkpointStorage: stateValues.checkpointStorage ?? "task",
			soundVolume: stateValues.soundVolume,
			browserViewportSize: stateValues.browserViewportSize ?? "900x600",
			screenshotQuality: stateValues.screenshotQuality ?? 75,
			remoteBrowserHost: stateValues.remoteBrowserHost,
			remoteBrowserEnabled: stateValues.remoteBrowserEnabled ?? false,
			cachedChromeHostUrl: stateValues.cachedChromeHostUrl as string | undefined,
			fuzzyMatchThreshold: stateValues.fuzzyMatchThreshold ?? 1.0,
			writeDelayMs: stateValues.writeDelayMs ?? 1000,
			terminalOutputLineLimit: stateValues.terminalOutputLineLimit ?? 500,
			terminalShellIntegrationTimeout:
				stateValues.terminalShellIntegrationTimeout ?? TERMINAL_SHELL_INTEGRATION_TIMEOUT,
			mode: stateValues.mode ?? defaultModeSlug,
			language: stateValues.language ?? formatLanguage(vscode.env.language),
			mcpEnabled: stateValues.mcpEnabled ?? true,
			// enableMcpServerCreation: stateValues.enableMcpServerCreation ?? true, // REMOVED
			alwaysApproveResubmit: stateValues.alwaysApproveResubmit ?? false,
			requestDelaySeconds: Math.max(5, stateValues.requestDelaySeconds ?? 10),
			rateLimitSeconds: stateValues.rateLimitSeconds ?? 0,
			currentApiConfigName: stateValues.currentApiConfigName ?? "default",
			listApiConfigMeta: stateValues.listApiConfigMeta ?? [],
			pinnedApiConfigs: stateValues.pinnedApiConfigs ?? {},
			modeApiConfigs: stateValues.modeApiConfigs ?? ({} as Record<Mode, string>),
			customModePrompts: stateValues.customModePrompts ?? {},
			customSupportPrompts: stateValues.customSupportPrompts ?? {},
			enhancementApiConfigId: stateValues.enhancementApiConfigId,
			experiments: stateValues.experiments ?? experimentDefault,
			autoApprovalEnabled: stateValues.autoApprovalEnabled ?? false,
			customModes,
			maxOpenTabsContext: stateValues.maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: stateValues.maxWorkspaceFiles ?? 200,
			openRouterUseMiddleOutTransform: stateValues.openRouterUseMiddleOutTransform ?? true,
			browserToolEnabled: stateValues.browserToolEnabled ?? true,
			telemetrySetting: stateValues.telemetrySetting || "unset",
			showRooIgnoredFiles: stateValues.showRooIgnoredFiles ?? true,
			maxReadFileLine: stateValues.maxReadFileLine ?? 500,
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = (this.getGlobalState("taskHistory") as HistoryItem[] | undefined) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		await this.updateGlobalState("taskHistory", history)
		return history
	}

	private async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		await this.contextProxy.setValue(key, value)
	}

	private getGlobalState<K extends keyof GlobalState>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public async setValue<K extends keyof RooCodeSettings>(key: K, value: RooCodeSettings[K]) {
		await this.contextProxy.setValue(key, value)
	}

	public getValue<K extends keyof RooCodeSettings>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public getValues() {
		return this.contextProxy.getValues()
	}

	public async setValues(values: RooCodeSettings) {
		await this.contextProxy.setValues(values)
	}

	get cwd() {
		return getWorkspacePath()
	}

	async resetState() {
		const answer = await vscode.window.showInformationMessage(
			t("common:confirmation.reset_state"),
			{ modal: true },
			t("common:answers.yes"),
		)
		if (answer !== t("common:answers.yes")) {
			return
		}
		await this.contextProxy.resetAllState()
		await this.providerSettingsManager.resetAllConfigs()
		await this.customModesManager.resetCustomModes()
		await this.removeClineFromStack()
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	public log(message: string) {
		this.outputChannel.appendLine(message)
		console.log(message)
	}

	// REMOVED ensureMcpServersDirectoryExists as it's no longer used

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.getCurrentCline()?.clineMessages || []
	}

	public getMcpHub(): any | undefined {
		return this.mcpHub
	}

	private async initializeMcpHub() {
		try {
			const rooCodeExtensionId = 'rooveterinaryinc.roo-cline'
			const mcpHubExtension = vscode.extensions.getExtension(rooCodeExtensionId)
			
			if (mcpHubExtension) {
				if (!mcpHubExtension.isActive) {
					this.log(`Activating Roo Code extension (${rooCodeExtensionId}) for MCP Hub...`)
					await mcpHubExtension.activate()
				}
				
				const mcpHub = mcpHubExtension.exports?.getMcpHub?.()
				if (mcpHub) {
					this.mcpHub = mcpHub
					this.log("MCP Hub initialized successfully")
				} else {
					this.log(`MCP Hub from ${rooCodeExtensionId} found, but 'getMcpHub' is not available. Exports: ${mcpHubExtension.exports ? Object.keys(mcpHubExtension.exports).join(', ') : 'none'}`)
				}
			} else {
				this.log(`Roo Code extension (${rooCodeExtensionId}) not found. MCP Hub will not be available.`)
			}
		} catch (error) {
			this.log(`Failed to initialize MCP Hub: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	public async getTelemetryProperties(): Promise<Record<string, any>> {
		const { mode, apiConfiguration, language } = await this.getState()
		const appVersion = this.context.extension?.packageJSON?.version
		const vscodeVersion = vscode.version
		const platform = process.platform
		const properties: Record<string, any> = {
			vscodeVersion,
			platform,
		}
		if (appVersion) {
			properties.appVersion = appVersion
		}
		if (language) {
			properties.language = language
		}
		if (mode) {
			properties.mode = mode
		}
		if (apiConfiguration?.apiProvider) {
			properties.apiProvider = apiConfiguration.apiProvider
		}
		const currentCline = this.getCurrentCline()
		if (currentCline?.api) {
			const { id: modelId } = currentCline.api.getModel()
			if (modelId) {
				properties.modelId = modelId
			}
		}
		if (currentCline?.diffStrategy) {
			properties.diffStrategy = currentCline.diffStrategy.getName()
		}
		return properties
	}
}
