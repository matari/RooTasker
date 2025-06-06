import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { ApiConfigMeta, ExtensionMessage, ExtensionState } from "../../../src/shared/ExtensionMessage"
import { Project, BaseSchedule, BaseWatcher, Prompt } from "../../../src/shared/ProjectTypes"; // Added Prompt

import { vscode } from "../utils/vscode"
import { convertTextMateToHljs } from "../utils/textMateToHljs"

import { Mode, CustomModePrompts, defaultModeSlug, defaultPrompts, ModeConfig } from "../../../src/shared/modes"


export interface ExtensionStateContextType extends ExtensionState {
	didHydrateState: boolean
	showWelcome: boolean
	theme: any
	currentCheckpoint?: string
	filePaths: string[]
	openedTabs: Array<{ label: string; isActive: boolean; path?: string }>

	setCustomInstructions: (value?: string) => void
	setAlwaysAllowReadOnly: (value: boolean) => void
	setAlwaysAllowReadOnlyOutsideWorkspace: (value: boolean) => void
	setAlwaysAllowWrite: (value: boolean) => void
	setAlwaysAllowWriteOutsideWorkspace: (value: boolean) => void
	setAlwaysAllowExecute: (value: boolean) => void
	setAlwaysAllowBrowser: (value: boolean) => void
	setAlwaysAllowMcp: (value: boolean) => void
	setAlwaysAllowModeSwitch: (value: boolean) => void
	setAlwaysAllowSubtasks: (value: boolean) => void
	setBrowserToolEnabled: (value: boolean) => void
	setShowRooIgnoredFiles: (value: boolean) => void
	setShowAnnouncement: (value: boolean) => void
	setAllowedCommands: (value: string[]) => void
	setSoundEnabled: (value: boolean) => void
	setSoundVolume: (value: number) => void
	terminalShellIntegrationTimeout?: number
	setTerminalShellIntegrationTimeout: (value: number) => void
	setTtsEnabled: (value: boolean) => void
	setTtsSpeed: (value: number) => void
	setDiffEnabled: (value: boolean) => void
	setEnableCheckpoints: (value: boolean) => void
	setBrowserViewportSize: (value: string) => void
	setFuzzyMatchThreshold: (value: number) => void
	setWriteDelayMs: (value: number) => void
	screenshotQuality?: number
	setScreenshotQuality: (value: number) => void
	terminalOutputLineLimit?: number
	setTerminalOutputLineLimit: (value: number) => void
	mcpEnabled: boolean
	setMcpEnabled: (value: boolean) => void
	// enableMcpServerCreation: boolean, // REMOVED
	// setEnableMcpServerCreation: (value: boolean) => void, // REMOVED
	alwaysApproveResubmit?: boolean
	setAlwaysApproveResubmit: (value: boolean) => void
	requestDelaySeconds: number
	setRequestDelaySeconds: (value: number) => void
	setCurrentApiConfigName: (value: string) => void
	setListApiConfigMeta: (value: ApiConfigMeta[]) => void
	mode: Mode
	setMode: (value: Mode) => void
	setCustomModePrompts: (value: CustomModePrompts) => void
	enhancementApiConfigId?: string
	setEnhancementApiConfigId: (value: string) => void
	setAutoApprovalEnabled: (value: boolean) => void
	customModes: ModeConfig[]
	setCustomModes: (value: ModeConfig[]) => void
	setMaxOpenTabsContext: (value: number) => void
	maxWorkspaceFiles: number
	setMaxWorkspaceFiles: (value: number) => void
	remoteBrowserEnabled?: boolean
	setRemoteBrowserEnabled: (value: boolean) => void
	awsUsePromptCache?: boolean
	setAwsUsePromptCache: (value: boolean) => void
	maxReadFileLine: number
	setMaxReadFileLine: (value: number) => void
	machineId?: string
	pinnedApiConfigs?: Record<string, boolean>
	setPinnedApiConfigs: (value: Record<string, boolean>) => void
	togglePinnedApiConfig: (configName: string) => void

	// Project related state
	projects?: Project[];
	projectSchedules?: Record<string, BaseSchedule[]>;
	projectWatchers?: Record<string, BaseWatcher[]>;
	activeProjectId?: string | null;
	setActiveProjectId?: (projectId: string | null) => void; 

	// Prompt related state
	prompts?: Prompt[];
	setPrompts?: (prompts: Prompt[]) => void;
}

export const ExtensionStateContext = createContext<ExtensionStateContextType | undefined>(undefined)

export const mergeExtensionState = (prevState: ExtensionState, newState: ExtensionState) => {
	const {
		customModePrompts: prevCustomModePrompts,
		customSupportPrompts: prevCustomSupportPrompts,
		experiments: prevExperiments,
		...prevRest
	} = prevState

	const {
		apiConfiguration,
		customModePrompts: newCustomModePrompts,
		customSupportPrompts: newCustomSupportPrompts,
		experiments: newExperiments,
		...newRest
	} = newState

	const customModePrompts = { ...prevCustomModePrompts, ...newCustomModePrompts }
	const customSupportPrompts = { ...prevCustomSupportPrompts, ...newCustomSupportPrompts }
	const experiments = { ...prevExperiments, ...newExperiments }
	const rest = { ...prevRest, ...newRest }

	// Note that we completely replace the previous apiConfiguration object with
	// a new one since the state that is broadcast is the entire apiConfiguration
	// and therefore merging is not necessary.
	return { ...rest, apiConfiguration, customModePrompts, customSupportPrompts, experiments }
}

export const ExtensionStateContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [state, setState] = useState<ExtensionState>({
		rootaskerLiteSvgUri: "", // Initialize SVG URI
		rootaskerDarkSvgUri: "",  // Initialize SVG URI
		version: "",
		clineMessages: [],
		taskHistory: [],
		shouldShowAnnouncement: false,
		allowedCommands: [],
		soundEnabled: false,
		soundVolume: 0.5,
		ttsEnabled: false,
		ttsSpeed: 1.0,
		diffEnabled: false,
		enableCheckpoints: true,
		checkpointStorage: "task",
		fuzzyMatchThreshold: 1.0,
		language: "en", // Default language code
		writeDelayMs: 1000,
		browserViewportSize: "900x600",
		screenshotQuality: 75,
		terminalOutputLineLimit: 500,
		terminalShellIntegrationTimeout: 4000,
		mcpEnabled: true,
		// enableMcpServerCreation: true, // REMOVED
		alwaysApproveResubmit: false,
		requestDelaySeconds: 5,
		currentApiConfigName: "default",
		listApiConfigMeta: [],
		mode: defaultModeSlug,
		customModePrompts: defaultPrompts,
		customSupportPrompts: {},
		enhancementApiConfigId: "",
		autoApprovalEnabled: false,
		customModes: [],
		maxOpenTabsContext: 20,
		maxWorkspaceFiles: 200,
		cwd: "",
		browserToolEnabled: true,
		telemetrySetting: "unset",
		showRooIgnoredFiles: true, // Default to showing .rooignore'd files with lock symbol (current behavior).
		renderContext: "sidebar",
		maxReadFileLine: 500, // Default max read file line limit
		pinnedApiConfigs: {},
		experiments: { search_and_replace: false, insert_content: false, powerSteering: false },
		// Initialize project state
		projects: [],
		projectSchedules: {},
		projectWatchers: {},
		activeProjectId: null,
		// Initialize prompt state
		prompts: [],
	})

	const [didHydrateState, setDidHydrateState] = useState(false)
	const [showWelcome, setShowWelcome] = useState(false)
	const [theme, setTheme] = useState<any>(undefined)
	const [filePaths, setFilePaths] = useState<string[]>([])
	const [openedTabs, setOpenedTabs] = useState<Array<{ label: string; isActive: boolean; path?: string }>>([])

	const [currentCheckpoint, setCurrentCheckpoint] = useState<string>()

	const setListApiConfigMeta = useCallback(
		(value: ApiConfigMeta[]) => setState((prevState) => ({ ...prevState, listApiConfigMeta: value })),
		[],
	)
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			switch (message.type) {
				case "state": {
					const newState = message.state!
					setState((prevState) => mergeExtensionState(prevState, newState))
					setDidHydrateState(true)
					break
				}
				case "theme": {
					if (message.text) {
						setTheme(convertTextMateToHljs(JSON.parse(message.text)))
					}
					break
				}
				case "workspaceUpdated": {
					const paths = message.filePaths ?? []
					const tabs = message.openedTabs ?? []

					setFilePaths(paths)
					setOpenedTabs(tabs)
					break
				}
				case "partialMessage": {
					const partialMessage = message.partialMessage!
					setState((prevState) => {
						// worth noting it will never be possible for a more up-to-date message to be sent here or in normal messages post since the presentAssistantContent function uses lock
						
						return prevState
					})
					break
				}
				case "currentCheckpointUpdated": {
					setCurrentCheckpoint(message.text)
					break
				}
				case "listApiConfig": {
					setListApiConfigMeta(message.listApiConfig ?? [])
					break
				}
				case "promptsUpdated": // Listen for updates from backend
					// Potentially trigger a fetch or directly update if payload contains prompts
					vscode.postMessage({ type: "getPrompts" }); // Request updated prompts
					break;
				case "setPrompts": // New message type from backend to set prompts
					if (message.payload && Array.isArray(message.payload)) {
						setState(prevState => ({ ...prevState, prompts: message.payload as Prompt[] }));
					}
					break;
				case "setProjects": // Handle projects update from backend
					if (message.payload && Array.isArray(message.payload)) {
						setState(prevState => ({ 
							...prevState, 
							projects: message.payload as Project[],
							// Potentially reset or update projectSchedules/Watchers if they are not part of this specific message
							// However, the main "state" message should handle their consistency with projects.
						}));
					}
					break;
				case "setEditingPromptWithContent": { // Added to handle full prompt data for editing
					if (message.payload) {
						// This message is specifically for PromptsView to update its form data
						// It's not a general state update, so we don't merge into main `state`.
						// PromptsView will need to listen for this message type directly if this approach is taken,
						// OR this needs to update a specific part of the context state that PromptsView consumes.
						// For now, let's assume PromptsView has a way to get this or it updates a specific context field.
						// Let's try updating a specific field in context if PromptsView is designed to use it.
						// However, `currentPromptData` is local to PromptsView.
						// A better way: PromptsView listens for this.
						// For now, this handler in context won't do anything directly to PromptsView's local state.
						// PromptsView's handleEditPrompt initiated the request; it should handle the response.
						// This message type in ExtensionMessage.ts is for the extension to *send* to webview.
						// The webview's top-level message listener (e.g., in App.tsx or specific view) should catch it.
						// Let's assume PromptsView will handle this via its own useEvent listener.
						// So, no direct state change here in the main context handler.
						// The message is defined, webviewMessageHandler sends it, PromptsView needs to catch it.
					}
					break;
				}
			}
		},
		[setListApiConfigMeta],
	)

	// Fetch initial prompts when component mounts after hydration
	useEffect(() => {
		if (didHydrateState) {
			// vscode.postMessage({ type: "getProjects" }); // Projects are now part of the main 'state' message
			vscode.postMessage({ type: "getPrompts" });  // Request prompts
		}
	}, [didHydrateState]);

	useEvent("message", handleMessage)

	useEffect(() => {
		vscode.postMessage({ type: "webviewDidLaunch" })
	}, [])

	const contextValue: ExtensionStateContextType = {
		...state,
		didHydrateState,
		showWelcome,
		theme,
		currentCheckpoint,
		filePaths,
		openedTabs,
		soundVolume: state.soundVolume,
		ttsSpeed: state.ttsSpeed,
		fuzzyMatchThreshold: state.fuzzyMatchThreshold,
		writeDelayMs: state.writeDelayMs,
		screenshotQuality: state.screenshotQuality,
		setCustomInstructions: (value) => setState((prevState) => ({ ...prevState, customInstructions: value })),
		setAlwaysAllowReadOnly: (value) => setState((prevState) => ({ ...prevState, alwaysAllowReadOnly: value })),
		setAlwaysAllowReadOnlyOutsideWorkspace: (value) =>
			setState((prevState) => ({ ...prevState, alwaysAllowReadOnlyOutsideWorkspace: value })),
		setAlwaysAllowWrite: (value) => setState((prevState) => ({ ...prevState, alwaysAllowWrite: value })),
		setAlwaysAllowWriteOutsideWorkspace: (value) =>
			setState((prevState) => ({ ...prevState, alwaysAllowWriteOutsideWorkspace: value })),
		setAlwaysAllowExecute: (value) => setState((prevState) => ({ ...prevState, alwaysAllowExecute: value })),
		setAlwaysAllowBrowser: (value) => setState((prevState) => ({ ...prevState, alwaysAllowBrowser: value })),
		setAlwaysAllowMcp: (value) => setState((prevState) => ({ ...prevState, alwaysAllowMcp: value })),
		setAlwaysAllowModeSwitch: (value) => setState((prevState) => ({ ...prevState, alwaysAllowModeSwitch: value })),
		setAlwaysAllowSubtasks: (value) => setState((prevState) => ({ ...prevState, alwaysAllowSubtasks: value })),
		setShowAnnouncement: (value) => setState((prevState) => ({ ...prevState, shouldShowAnnouncement: value })),
		setAllowedCommands: (value) => setState((prevState) => ({ ...prevState, allowedCommands: value })),
		setSoundEnabled: (value) => setState((prevState) => ({ ...prevState, soundEnabled: value })),
		setSoundVolume: (value) => setState((prevState) => ({ ...prevState, soundVolume: value })),
		setTtsEnabled: (value) => setState((prevState) => ({ ...prevState, ttsEnabled: value })),
		setTtsSpeed: (value) => setState((prevState) => ({ ...prevState, ttsSpeed: value })),
		setDiffEnabled: (value) => setState((prevState) => ({ ...prevState, diffEnabled: value })),
		setEnableCheckpoints: (value) => setState((prevState) => ({ ...prevState, enableCheckpoints: value })),
		setBrowserViewportSize: (value: string) =>
			setState((prevState) => ({ ...prevState, browserViewportSize: value })),
		setFuzzyMatchThreshold: (value) => setState((prevState) => ({ ...prevState, fuzzyMatchThreshold: value })),
		setWriteDelayMs: (value) => setState((prevState) => ({ ...prevState, writeDelayMs: value })),
		setScreenshotQuality: (value) => setState((prevState) => ({ ...prevState, screenshotQuality: value })),
		setTerminalOutputLineLimit: (value) =>
			setState((prevState) => ({ ...prevState, terminalOutputLineLimit: value })),
		setTerminalShellIntegrationTimeout: (value) =>
			setState((prevState) => ({ ...prevState, terminalShellIntegrationTimeout: value })),
		setMcpEnabled: (value) => setState((prevState) => ({ ...prevState, mcpEnabled: value })),
		// setEnableMcpServerCreation: (value) => // REMOVED
		// 	setState((prevState) => ({ ...prevState, enableMcpServerCreation: value })), // REMOVED
		setAlwaysApproveResubmit: (value) => setState((prevState) => ({ ...prevState, alwaysApproveResubmit: value })),
		setRequestDelaySeconds: (value) => setState((prevState) => ({ ...prevState, requestDelaySeconds: value })),
		setCurrentApiConfigName: (value) => setState((prevState) => ({ ...prevState, currentApiConfigName: value })),
		setListApiConfigMeta,
		setMode: (value: Mode) => setState((prevState) => ({ ...prevState, mode: value })),
		setCustomModePrompts: (value) => setState((prevState) => ({ ...prevState, customModePrompts: value })),
		setEnhancementApiConfigId: (value) =>
			setState((prevState) => ({ ...prevState, enhancementApiConfigId: value })),
		setAutoApprovalEnabled: (value) => setState((prevState) => ({ ...prevState, autoApprovalEnabled: value })),
		setCustomModes: (value) => setState((prevState) => ({ ...prevState, customModes: value })),
		setMaxOpenTabsContext: (value) => setState((prevState) => ({ ...prevState, maxOpenTabsContext: value })),
		setMaxWorkspaceFiles: (value) => setState((prevState) => ({ ...prevState, maxWorkspaceFiles: value })),
		setBrowserToolEnabled: (value) => setState((prevState) => ({ ...prevState, browserToolEnabled: value })),
		setShowRooIgnoredFiles: (value) => setState((prevState) => ({ ...prevState, showRooIgnoredFiles: value })),
		setRemoteBrowserEnabled: (value) => setState((prevState) => ({ ...prevState, remoteBrowserEnabled: value })),
		setAwsUsePromptCache: (value) => setState((prevState) => ({ ...prevState, awsUsePromptCache: value })),
		setMaxReadFileLine: (value) => setState((prevState) => ({ ...prevState, maxReadFileLine: value })),
		setPinnedApiConfigs: (value) => setState((prevState) => ({ ...prevState, pinnedApiConfigs: value })),
		togglePinnedApiConfig: (configId) =>
			setState((prevState) => {
				const currentPinned = prevState.pinnedApiConfigs || {}
				const newPinned = {
					...currentPinned,
					[configId]: !currentPinned[configId],
				}

				// If the config is now unpinned, remove it from the object
				if (!newPinned[configId]) {
					delete newPinned[configId]
				}

				return { ...prevState, pinnedApiConfigs: newPinned }
			}),
		// Placeholder for setActiveProjectId, actual implementation might involve posting messages
		setActiveProjectId: (projectId) => setState((prevState) => ({ ...prevState, activeProjectId: projectId })),
		setPrompts: (newPrompts) => setState((prevState) => ({ ...prevState, prompts: newPrompts})),
	}

	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}

export const useExtensionState = () => {
	const context = useContext(ExtensionStateContext)
	if (context === undefined) {
		throw new Error("useExtensionState must be used within an ExtensionStateContextProvider")
	}
	return context
}
