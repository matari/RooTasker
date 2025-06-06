import { z } from "zod"
import { Mode, PromptComponent, ModeConfig } from "./modes"

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"

export type PromptMode = Mode | "enhance"

export type AudioType = "notification" | "celebration" | "progress_loop"

export interface WebviewMessage {
	type:
		| "apiConfiguration"
		| "deleteMultipleTasksWithIds"
		| "toggleScheduleActive"
		| "runScheduleNow" // Added for Run Now button
		| "duplicateSchedule" // Added for duplicate functionality
		| "schedulesUpdated"
		| "addWatcher"
		| "updateWatcher"
		| "deleteWatcher"
		| "toggleWatcherActive"
		| "duplicateWatcher" // Added for duplicate functionality
		| "watchersUpdated"
		| "selectDirectoryForWatcher" // Added for watcher form
		| "directorySelectedForWatcher" // Added for watcher form response
		| "currentApiConfigName"
		| "saveApiConfiguration"
		| "upsertApiConfiguration"
		| "deleteApiConfiguration"
		| "loadApiConfiguration"
		| "loadApiConfigurationById"
		| "renameApiConfiguration"
		| "getListApiConfiguration"
		| "customInstructions"
		| "allowedCommands"
		| "alwaysAllowReadOnly"
		| "alwaysAllowReadOnlyOutsideWorkspace"
		| "alwaysAllowWrite"
		| "alwaysAllowWriteOutsideWorkspace"
		| "alwaysAllowExecute"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "importSettings"
		| "exportSettings"
		| "resetState"
		| "requestOllamaModels"
		| "requestLmStudioModels"
		| "openImage"
		| "openFile"
		| "openMention"
		| "cancelTask"
		| "refreshOpenRouterModels"
		| "refreshGlamaModels"
		| "refreshUnboundModels"
		| "refreshRequestyModels"
		| "refreshOpenAiModels"
		| "alwaysAllowBrowser"
		| "alwaysAllowMcp"
		| "alwaysAllowModeSwitch"
		| "alwaysAllowSubtasks"
		| "playSound"
		| "playTts"
		| "stopTts"
		| "soundEnabled"
		| "ttsEnabled"
		| "ttsSpeed"
		| "soundVolume"
		| "diffEnabled"
		| "enableCheckpoints"
		| "checkpointStorage"
		| "browserViewportSize"
		| "screenshotQuality"
		| "remoteBrowserHost"
		| "openMcpSettings"
		| "openProjectMcpSettings"
		| "restartMcpServer"
		| "toggleToolAlwaysAllow"
		| "toggleMcpServer"
		| "updateMcpTimeout"
		| "fuzzyMatchThreshold"
		| "writeDelayMs"
		| "enhancePrompt"
		| "enhancedPrompt"
		| "draggedImages"
		| "deleteMessage"
		| "terminalOutputLineLimit"
		| "terminalShellIntegrationTimeout"
		| "mcpEnabled"
		| "enableMcpServerCreation"
		| "searchCommits"
		| "alwaysApproveResubmit"
		| "requestDelaySeconds"
		| "setApiConfigPassword"
		| "requestVsCodeLmModels"
		| "mode"
		| "updatePrompt"
		| "updateSupportPrompt"
		| "resetSupportPrompt"
		| "getSystemPrompt"
		| "copySystemPrompt"
		| "systemPrompt"
		| "enhancementApiConfigId"
		| "updateExperimental"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "setopenAiCustomModelInfo"
		| "openCustomModesSettings"
		| "checkpointDiff"
		| "checkpointRestore"
		| "deleteMcpServer"
		| "maxOpenTabsContext"
		| "maxWorkspaceFiles"
		| "humanRelayResponse"
		| "humanRelayCancel"
		| "browserToolEnabled"
		| "telemetrySetting"
		| "showRooIgnoredFiles"
		| "testBrowserConnection"
		| "browserConnectionResult"
		| "remoteBrowserEnabled"
		| "language"
		| "maxReadFileLine"
		| "searchFiles"
		| "toggleApiConfigPin"
		| "resumeTask"
		// Project related message types
		| "createProject"
		| "updateProject"
		| "deleteProject"
		| "setActiveProject"
		| "addScheduleToProject"
		| "updateScheduleInProject"
		| "deleteScheduleFromProject"
		| "addWatcherToProject"
		| "updateWatcherInProject"
		| "deleteWatcherFromProject"
		| "selectProjectDirectory" // For project form
		| "projectDirectorySelected" // Response from backend
		| "projectsUpdated" // Added for project list updates
		| "getProjects" // For project view to request project list (was recorder)
		| "getPrompts" // Added for Prompts: Webview to Extension
		| "savePromptAndOpenFile" // Added for Prompts feature
		| "runPromptNow" // Added for Prompts: Run Now feature
		| "deletePrompt" // Added for Prompts: Delete feature
		| "promptsUpdated" // Added for Prompts: Notify webview of updates
		| "navigateToNewProjectForm" // Added for SplashPage to request new project form
		| "updatePromptMetadata" // For saving only metadata from PromptForm
		| "createPromptWithMetadata" // For creating a new prompt (metadata only, content file to be created)
		| "openPromptContentFile" // Request to open the prompt's content file
		| "requestPromptImprovement" // Request to start the prompt improvement workflow
		| "getPromptContent" // Request for full content of a specific prompt
		// REMOVED Recorder specific messages: "openRecorderPanel", "getNgrokUrl", "getRecordingsForProject", "playRecording", "renameRecording", "deleteRecording"
		| "openExternalUrl" // General utility
	text?: string
	disabled?: boolean
	askResponse?: ClineAskResponse
	apiConfiguration?: any
	images?: string[]
	bool?: boolean
	value?: number
	commands?: string[]
	audioType?: AudioType
	serverName?: string
	toolName?: string
	alwaysAllow?: boolean
	mode?: Mode
	promptMode?: PromptMode
	customPrompt?: PromptComponent
	dataUrls?: string[]
	values?: Record<string, any>
	query?: string
	slug?: string
	modeConfig?: ModeConfig
	timeout?: number
	payload?: WebViewMessagePayload
	source?: "global" | "project"
	requestId?: string
	ids?: string[]
	scheduleId?: string
	watcherId?: string
	projectId?: string; // Added for project operations
	active?: boolean
	data?: any // Generic data payload for add/update operations
	path?: string
	taskId?: string
	// REMOVED Payloads for recorder messages
	url?: string; // For openExternalUrl
	// filename?: string; // REMOVED
	// oldFilename?: string; // REMOVED
	// newFilename?: string; // REMOVED
}

export const checkoutDiffPayloadSchema = z.object({
	ts: z.number(),
	previousCommitHash: z.string().optional(),
	commitHash: z.string(),
	mode: z.enum(["full", "checkpoint"]),
})

export type CheckpointDiffPayload = z.infer<typeof checkoutDiffPayloadSchema>

export const checkoutRestorePayloadSchema = z.object({
	ts: z.number(),
	commitHash: z.string(),
	mode: z.enum(["preview", "restore"]),
})

export type CheckpointRestorePayload = z.infer<typeof checkoutRestorePayloadSchema>

// Payload for creating/updating a prompt and opening it
export interface SavePromptPayload {
  title: string;
  description?: string;
  tags?: string[];
  promptId?: string; // For updates
  // content will be handled by the editor part
}

export interface RunPromptNowPayload {
  promptId: string;
  mode?: string; // Optional: to specify which Roo Code mode to use
}

export type WebViewMessagePayload = CheckpointDiffPayload | CheckpointRestorePayload | SavePromptPayload | RunPromptNowPayload;
