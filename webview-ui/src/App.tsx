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
import ProjectsView from "./components/projects/ProjectsView"; // Added import
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import SplashPage from "./components/common/SplashPage";
import type { NavigationPayload } from "./types";
import type { Project } from "../../src/shared/ProjectTypes"; // Import Project for onOpenEditProjectModal

type MainAppTab = "projects" | "scheduler" | "watchers"; // Added "projects"

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
		return <SplashPage />; // Show SplashPage while hydrating
	}

	return (
		<div className="flex flex-col h-screen"> {/* Main container */}
			<Tabs value={activeMainTab} onValueChange={(value) => handleNavigateToTab(value as MainAppTab)} className="flex flex-col flex-grow">
				{/* Header Section */}
				<div className="flex justify-between items-center p-2 border-b border-vscode-panel-border">
					{/* Tabbed navigation on the left */}
					<TabsList className="flex gap-4">
						<TabsTrigger
							value="projects"
							className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Projects">
							<span className="codicon codicon-project"></span>
							<span>Projects</span>
						</TabsTrigger>
						<TabsTrigger
							value="scheduler"
							className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Scheduled Tasks">
							<span className="codicon codicon-calendar"></span>
							<span>Scheduled Tasks</span>
						</TabsTrigger>
						<TabsTrigger
							value="watchers"
							className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger"
							title="Watchers">
							<span className="codicon codicon-eye"></span>
							<span>Watchers</span>
						</TabsTrigger>
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
