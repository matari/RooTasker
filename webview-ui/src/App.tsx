import { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionMessage } from "../../src/shared/ExtensionMessage"
import TranslationProvider from "./i18n/TranslationContext"

import { vscode } from "./utils/vscode"
import { telemetryClient } from "./utils/TelemetryClient"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import SchedulerView from "./components/scheduler/SchedulerView"
import WatchersView from "./components/watchers/WatchersView" // Added
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs" // Added

type MainAppTab = "scheduler" | "watchers"; // New tab type

const App = () => {
	const { didHydrateState, telemetrySetting, telemetryKey, machineId } = useExtensionState()
	const [activeMainTab, setActiveMainTab] = useState<MainAppTab>("scheduler");



	useEffect(() => {
		if (didHydrateState) {
			telemetryClient.updateTelemetryState(telemetrySetting, telemetryKey, machineId)
		}
	}, [telemetrySetting, telemetryKey, machineId, didHydrateState])

	// Tell the extension that we are ready to receive messages.
	useEffect(() => vscode.postMessage({ type: "webviewDidLaunch" }), [])

	if (!didHydrateState) {
		return null
	}

	return (
		<div className="flex flex-col h-screen p-2 gap-2"> {/* Added padding and gap for tabs */}
			<Tabs value={activeMainTab} onValueChange={(value) => setActiveMainTab(value as MainAppTab)} className="flex flex-col flex-grow">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="scheduler">
						<span className="codicon codicon-calendar mr-2"></span>Scheduled Tasks
					</TabsTrigger>
					<TabsTrigger value="watchers">
						<span className="codicon codicon-eye mr-2"></span>Watchers
					</TabsTrigger>
				</TabsList>
				<TabsContent value="scheduler" className="flex-grow overflow-auto">
					<SchedulerView onDone={() => {}} />
				</TabsContent>
				<TabsContent value="watchers" className="flex-grow overflow-auto">
					<WatchersView />
				</TabsContent>
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
