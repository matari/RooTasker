import { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"; // Import Button

import { ExtensionMessage } from "../../src/shared/ExtensionMessage"
import TranslationProvider from "./i18n/TranslationContext"

import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import SchedulerView from "./components/scheduler/SchedulerView"
import WatchersView from "./components/watchers/WatchersView"
import ProjectsView from "./components/projects/ProjectsView"; 
import PromptsView from "./components/prompts/PromptsView"; // Added for Prompts
// import RecorderView from "./components/recorder/RecorderView"; // REMOVED for Recorder
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import SplashPage from "./components/common/SplashPage";
import type { NavigationPayload } from "./types";
import type { Project } from "../../src/shared/ProjectTypes"; // Import Project for onOpenEditProjectModal

type MainAppTab = "projects" | "scheduler" | "watchers" | "prompts"; // Added "prompts"

const App = () => {
	const { didHydrateState, telemetrySetting, telemetryKey, machineId } = useExtensionState()
	const [activeMainTab, setActiveMainTab] = useState<MainAppTab>("projects"); // Default to projects tab
	const [navigationPayload, setNavigationPayload] = useState<NavigationPayload | null>(null); // NavigationPayload now includes itemId
	const [showNewProjectModal, setShowNewProjectModal] = useState(false);
	// Add state for editing project later if needed for App.tsx to control edit form
	// const [editingProjectData, setEditingProjectData] = useState<Project | null>(null);


	// Updated handleNavigateToTab to accept payload with itemId
	const handleNavigateToTab = (tabKey: MainAppTab, payload?: NavigationPayload) => {
		setActiveMainTab(tabKey);
		if (payload) {
			setNavigationPayload(payload);
		} else {
			setNavigationPayload(null); // Clear payload if not provided
		}
	};

	const handleToggleNewProjectModal = () => {
		setShowNewProjectModal(prev => !prev);
		// setEditingProjectData(null); // Ensure we are not in edit mode
	};

	const handleOpenEditProjectModal = (project: Project) => {
		// This function would be used if App.tsx fully controlled the edit modal
		// setEditingProjectData(project);
		// setShowNewProjectModal(true); // Or a separate state for edit modal
		console.log("Placeholder: Open edit project modal for", project.name);
	};


	useEffect(() => {
		if (didHydrateState) {
			telemetryClient.updateTelemetryState(telemetrySetting, telemetryKey, machineId)
		}
	}, [telemetrySetting, telemetryKey, machineId, didHydrateState])

	// Tell the extension that we are ready to receive messages.
	useEffect(() => vscode.postMessage({ type: "webviewDidLaunch" }), [])

	if (!didHydrateState) {
		return <SplashPage tabType="generic" />; // Show SplashPage while hydrating
	}

	return (
		<div className="flex flex-col h-screen"> {/* Main container */}
			<Tabs value={activeMainTab} onValueChange={(value) => handleNavigateToTab(value as MainAppTab)} className="flex flex-col flex-grow">
				{/* Header Section */}
				<div className="flex justify-between items-center p-2 border-b border-vscode-panel-border custom-tabs-bar">
					{/* Tabbed navigation on the left */}
					<TabsList className="flex gap-4 custom-tabs-list-transparent">
						<TabsTrigger
							value="projects"
							className="flex items-center gap-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Projects">
							<span
								className="inline-block rounded-full w-2 h-2 mr-1.5 flex-shrink-0 project-tab-dot-icon"
								aria-hidden="true"
							/>
							<span>Projects</span>
						</TabsTrigger>
						<TabsTrigger
							value="scheduler"
							className="flex items-center gap-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Scheduled Tasks">
							<span className="codicon codicon-calendar"></span>
							<span>Scheduled Tasks</span>
						</TabsTrigger>
						<TabsTrigger
							value="watchers"
							className="flex items-center gap-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Watchers">
							<span className="codicon codicon-eye"></span>
							<span>Watchers</span>
						</TabsTrigger>
						<TabsTrigger
							value="prompts"
							className="flex items-center gap-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Prompts">
							<span className="codicon codicon-lightbulb"></span>
							<span>Prompts</span>
						</TabsTrigger>
						{/* <TabsTrigger
							value="recorder"
							className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Voice Recorder">
							<span className="codicon codicon-mic"></span>
							<span>Recorder</span>
						</TabsTrigger> */} {/* REMOVED Recorder Tab Trigger */}
					</TabsList>

					{/* Action buttons on the right */}
					<div className="flex items-center gap-2">
						{activeMainTab === 'projects' && (
							<Button size="sm" variant="ghost" onClick={handleToggleNewProjectModal} title="New Project">
								<span className="codicon codicon-add"></span>
							</Button>
						)}
						{activeMainTab === 'scheduler' && (
							<Button size="sm" variant="ghost" onClick={() => handleNavigateToTab('scheduler', { view: 'form' })} title="New Task">
								<span className="codicon codicon-add"></span>
							</Button>
						)}
						{activeMainTab === 'watchers' && (
							<Button size="sm" variant="ghost" onClick={() => handleNavigateToTab('watchers', { view: 'form' })} title="New Watcher">
								<span className="codicon codicon-add"></span>
							</Button>
						)}
						{activeMainTab === 'prompts' && (
							<Button size="sm" variant="ghost" onClick={() => handleNavigateToTab('prompts', { view: 'form' })} title="New Prompt">
								<span className="codicon codicon-add"></span>
							</Button>
						)}
						{/* No specific action button for recorder tab for now */}
					</div>
				</div>

				{/* Content Area */}
				<div className="flex-grow overflow-auto"> {/* Removed p-2 for full bleed content areas */}
					<TabsContent value="projects" className="h-full mt-0">
						<ProjectsView
							onNavigateToTab={handleNavigateToTab}
							isNewProjectModalOpen={showNewProjectModal}
							onCloseNewProjectModal={handleToggleNewProjectModal}
							onOpenEditProjectModal={handleOpenEditProjectModal} // Pass the handler
						/>
					</TabsContent>
					<TabsContent value="scheduler" className="h-full mt-0">
						<SchedulerView
							onDone={() => {}}
							initialAction={activeMainTab === 'scheduler' ? navigationPayload : null}
							onInitialActionConsumed={() => setNavigationPayload(null)}
						/>
					</TabsContent>
					<TabsContent value="watchers" className="h-full mt-0">
						<WatchersView
							initialAction={activeMainTab === 'watchers' ? navigationPayload : null}
							onInitialActionConsumed={() => setNavigationPayload(null)}
						/>
					</TabsContent>
					<TabsContent value="prompts" className="h-full mt-0">
						<PromptsView 
							initialAction={activeMainTab === 'prompts' ? navigationPayload : null}
							onInitialActionConsumed={() => setNavigationPayload(null)}
						/>
					</TabsContent>
					{/* <TabsContent value="recorder" className="h-full mt-0">
						<RecorderView />
					</TabsContent> */} {/* REMOVED Recorder Tab Content */}
				</div>
			</Tabs>
		</div>
	)
}

const queryClient = new QueryClient()

const AppWithProviders = () => (
	<ExtensionStateContextProvider>
		<TranslationProvider>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</TranslationProvider>
	</ExtensionStateContextProvider>
)

export default AppWithProviders
