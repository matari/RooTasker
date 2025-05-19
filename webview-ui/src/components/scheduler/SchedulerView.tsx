import React, { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "../../components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Virtuoso } from "react-virtuoso"
import { cn } from "../../lib/utils"
import { useExtensionState } from "../../context/ExtensionStateContext"
import {
	getAllModes,
} from "../../../../src/shared/modes"
import { vscode } from "../../utils/vscode"
import { Tab, TabContent, TabHeader } from "../common/Tab"
import { useAppTranslation } from "../../i18n/TranslationContext"
import ConfirmationDialog from "../ui/confirmation-dialog"

// Import new components
import ScheduleForm from "./ScheduleForm"
import type { ScheduleFormHandle } from "./ScheduleForm"
import { Schedule } from "./types"
import ScheduleSortControl from "./ScheduleSortControl"
import ScheduleList from "./ScheduleList"
// Helper function to format dates without year and seconds
const formatDateWithoutYearAndSeconds = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

type SchedulerViewProps = {
	onDone: () => void
}

const SchedulerView = ({ onDone }: SchedulerViewProps) => {
	const { t } = useAppTranslation()
	const { customModes } = useExtensionState()
	
	// Add logging for component initialization
	console.log("SchedulerView component initialized")
	
	// Tab state
	const [activeTab, setActiveTab] = useState<string>("schedules")
	
	// Schedule list state
	const [schedules, setSchedules] = useState<Schedule[]>([])
	const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
	
	// Sorting state
	type SortMethod = "nextExecution" | "lastExecution" | "lastUpdated" | "created" | "activeStatus"
	type SortDirection = "asc" | "desc"
	
	// Initialize sort state from localStorage or use defaults
	const [sortMethod, setSortMethod] = useState<SortMethod>(() => {
		const savedMethod = localStorage.getItem('roo-sort-method');
		return (savedMethod as SortMethod) || "created";
	});
	
	const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
		const savedDirection = localStorage.getItem('roo-sort-direction');
		return (savedDirection as SortDirection) || "desc";
	});
	
	// Save sort state to localStorage whenever it changes
	useEffect(() => {
		localStorage.setItem('roo-sort-method', sortMethod);
	}, [sortMethod]);
	
	useEffect(() => {
		localStorage.setItem('roo-sort-direction', sortDirection);
	}, [sortDirection]);
	
	// Form editing state
	const [isEditing, setIsEditing] = useState<boolean>(false)
	const [initialFormData, setInitialFormData] = useState<Partial<Schedule>>({})
	
	// Delete confirmation dialog state
	const [dialogOpen, setDialogOpen] = useState(false)
	const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null)
	
	// Get all available modes (both default and custom)
	const availableModes = useMemo(() => getAllModes(customModes), [customModes])

	// Ref for ScheduleForm
	const scheduleFormRef = useRef<ScheduleFormHandle>(null);
	const [isFormValid, setIsFormValid] = useState(false);
	// No need for default start time effect - handled in ScheduleForm
	
	// Load schedules from file
	useEffect(() => {
		loadSchedules()
		
		// Set up event listener for file content messages
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			
			// Check if this is a response with file content
			if (message.type === "fileContent" && message.path === "./.rootasker/schedules.json") {
				try {
					const data = JSON.parse(message.content);
					if (data && Array.isArray(data.schedules)) {
						console.log("Received schedules from file:", data.schedules);
						setSchedules(data.schedules);
					}
				} catch (e) {
					console.error("Failed to parse schedules from file content message:", e);
				}
			}
			
			// Listen for schedulesUpdated message from extension
			// This will be triggered when the .roo/schedules.json file is updated externally
			if (message.type === "schedulesUpdated") {
				console.log("Received schedulesUpdated message, reloading schedules");
				loadSchedules();
			}
		};
		
		// Add the event listener
		window.addEventListener('message', handleMessage);
		
		// Clean up the event listener when component unmounts
		return () => {
			window.removeEventListener('message', handleMessage);
		};
	}, [])
	
	// Load schedules from .roo/schedules.json
	const loadSchedules = async () => {
		try {
			console.log("Requesting schedules from extension")
			
			// Request the schedules file content from the extension
			vscode.postMessage({
				type: "openFile",
				text: "./.rootasker/schedules.json",
				values: { open: false }
			})
			
		} catch (error) {
			console.error("Failed to load schedules:", error);
		}
	}

	// Save schedule to file
	const saveSchedule = (formData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'>) => {
		if (!formData.name.trim()) {
			// Show error or validation message
			console.error("Schedule name cannot be empty")
			return
		}
		
		// Get the mode display name from the available modes
		const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode)
		const modeDisplayName = selectedModeConfig?.name || formData.mode
		
		const now = new Date().toISOString()
		let updatedSchedules = [...schedules]
		
		if (isEditing && selectedScheduleId) {
			// Update existing schedule
			updatedSchedules = updatedSchedules.map(schedule =>
				schedule.id === selectedScheduleId
					? {
						...schedule,
						...formData,
						modeDisplayName,
						updatedAt: now
					}
					: schedule
			)
		} else {
			// Create new schedule
			const newSchedule: Schedule = {
				id: Date.now().toString(),
				...formData,
				modeDisplayName,
				createdAt: now,
				updatedAt: now
			}
			
			updatedSchedules.push(newSchedule)
		}
		
		
		// Save to file using openFile message type with create option
		const fileContent = JSON.stringify({ schedules: updatedSchedules }, null, 2)
		console.log("Saving schedules to file:", fileContent)
		
		// First update local state
		setSchedules(updatedSchedules)
		
		// Then save to file and notify backend after file is saved
		// This ensures the file is written before the backend tries to read it
		vscode.postMessage({
		  type: "openFile",
		  text: "./.rootasker/schedules.json",
		  values: {
		    create: true,
		    content: fileContent,
		    callback: "schedulesUpdated" // Add callback to trigger schedulesUpdated after file is saved
		  }
		})
		
		resetForm()
		setActiveTab("schedules")
	}


	// Edit schedule
	const editSchedule = (scheduleId: string) => {
		const schedule = schedules.find(s => s.id === scheduleId)
		if (schedule) {
			setSelectedScheduleId(scheduleId)
			
			// Set initial form data for editing
			setInitialFormData({
				name: schedule.name,
				mode: schedule.mode,
				taskInstructions: schedule.taskInstructions,
				scheduleKind: schedule.scheduleKind,
				cronExpression: schedule.cronExpression,
				timeInterval: schedule.timeInterval,
				timeUnit: schedule.timeUnit,
				selectedDays: schedule.selectedDays,
				startDate: schedule.startDate,
				startHour: schedule.startHour,
				startMinute: schedule.startMinute,
				expirationDate: schedule.expirationDate,
				expirationHour: schedule.expirationHour,
				expirationMinute: schedule.expirationMinute,
				requireActivity: schedule.requireActivity,
				taskInteraction: schedule.taskInteraction,
				inactivityDelay: schedule.inactivityDelay,
				lastExecutionTime: schedule.lastExecutionTime,
				lastSkippedTime: schedule.lastSkippedTime,
				lastTaskId: schedule.lastTaskId,
				nextExecutionTime: schedule.nextExecutionTime
			})
			
			setIsEditing(true)
			setActiveTab("edit")
		}
	}
	
	// Delete schedule
	const deleteSchedule = (scheduleId: string) => {
		const updatedSchedules = schedules.filter(s => s.id !== scheduleId)
		
		// Save to file
		const fileContent = JSON.stringify({ schedules: updatedSchedules }, null, 2)
		console.log("Saving updated schedules to file after deletion:", fileContent)
		
		// Update state first
		setSchedules(updatedSchedules)
		
		// Then save to file with callback to reload schedules
		vscode.postMessage({
		  type: "openFile",
		  text: "./.rootasker/schedules.json",
		  values: {
		    create: true,
		    content: fileContent,
		    callback: "schedulesUpdated" // Add callback to trigger schedulesUpdated after file is saved
		  }
		})
		
		// If we were editing this schedule, reset the form
		if (selectedScheduleId === scheduleId) {
			resetForm()
		}
	}
	
	// Reset form
	const resetForm = () => {
		setSelectedScheduleId(null)
		setInitialFormData({})
		setIsEditing(false)
	}
	
	// Create new schedule
	const createNewSchedule = () => {
		resetForm()
		setActiveTab("edit")
	}
	// Validation is now handled in ScheduleForm

	const onRunNowHandler = (scheduleId: string) => {
		vscode.postMessage({
			type: "runScheduleNow",
			scheduleId: scheduleId,
		});
	};
	
	// (Sorting logic and helper moved to ScheduleSortControl)

	return (
		<div className="h-full flex flex-col"> {/* Replaced Tab with a div */}
			{/* Header-like section for buttons, moved inside */}
			<div className="flex justify-end items-center p-1 border-b border-vscode-panel-border mb-2">
				{activeTab === "edit" ? (
					<div className="flex gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								resetForm();
								setActiveTab("schedules");
							}}
							data-testid="cancel-edit-schedule-button"
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={() => {
								scheduleFormRef.current?.submitForm();
							}}
							disabled={!isFormValid}
							data-testid="save-schedule-button"
						>
							Save Schedule
						</Button>
					</div>
				) : (
					<Button size="sm" onClick={createNewSchedule} data-testid="create-new-schedule-button">Add Task</Button>
				)}
			</div>
			
			{/* Inner Tabs for list/edit form */}
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow">
				<TabsContent value="schedules" className="space-y-2 flex-1 overflow-auto">
						{schedules.length === 0 ? (
							<div className="text-center py-8 text-vscode-descriptionForeground">
								No schedules found. Create your first schedule to get started.
							</div>
						) : (
							<div className="h-full flex flex-col">
								<ScheduleSortControl
									schedules={schedules}
									sortMethod={sortMethod}
									setSortMethod={setSortMethod}
									sortDirection={sortDirection}
									setSortDirection={setSortDirection}
								>
									{(sortedSchedules) => (
										<ScheduleList
											schedules={sortedSchedules}
											onEdit={editSchedule}
											onDelete={(id) => {
												setScheduleToDelete(id);
												setDialogOpen(true);
											}}
											onToggleActive={(id, active) => {
												// 1. Call backend to toggle schedule active state
												vscode.postMessage({
													type: "toggleScheduleActive",
													scheduleId: id,
													active,
												});
												// 2. Update local state and storage
												const updatedSchedules = schedules.map(s =>
													s.id === id ? { ...s, active } : s
												);
												
												const fileContent = JSON.stringify({ schedules: updatedSchedules }, null, 2);
												console.log("Saving updated schedules to file after toggle active:", fileContent);
												// Update state first
												setSchedules(updatedSchedules);
												// Then save to file with callback to reload schedules
												vscode.postMessage({
													type: "openFile",
													text: "./.rootasker/schedules.json",
													values: {
														create: true,
														content: fileContent,
														callback: "schedulesUpdated"
													}
												});
											}}
											onRunNow={onRunNowHandler}
											onDuplicate={(scheduleId) => {
												vscode.postMessage({
													type: "duplicateSchedule",
													scheduleId: scheduleId,
												});
												// The webview message handler will update the file and trigger a refresh
											}}
											onResumeTask={(taskId) => {
												console.log("Sending resumeTask message to extension");
												vscode.postMessage({
													type: "resumeTask",
													taskId
												});
											}}
											formatDate={formatDateWithoutYearAndSeconds}
										/>
									)}
								</ScheduleSortControl>
							</div>
						)}
					</TabsContent>
						
					<TabsContent value="edit">
						<ScheduleForm
							ref={scheduleFormRef}
							initialData={initialFormData}
							isEditing={isEditing}
							availableModes={availableModes}
							onSave={saveSchedule}
							onCancel={() => {
								resetForm()
								setActiveTab("schedules")
							}}
							onValidityChange={setIsFormValid}
						/>
					</TabsContent>
				</Tabs>
			{/* Confirmation Dialog for Schedule Deletion, moved to be a sibling of Tabs */}
			<ConfirmationDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				title="Delete Schedule"
				description="Are you sure you want to delete this schedule? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					if (scheduleToDelete) {
						deleteSchedule(scheduleToDelete);
						setScheduleToDelete(null);
					}
				}}
				confirmClassName="bg-vscode-errorForeground hover:bg-vscode-errorForeground/90"
			/>
		</div>
	)
}

export default SchedulerView
