import React, { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "../../components/ui/button"
import { Tabs, TabsContent } from "../../components/ui/tabs" // TabsList and TabsTrigger are not used
import { Virtuoso } from "react-virtuoso"
import { cn } from "../../lib/utils"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { // BaseSchedule is not directly used here, Schedule type from ./types already extends it
	getAllModes,
} from "../../../../src/shared/modes"
import { vscode } from "../../utils/vscode"
// import { Tab, TabContent, TabHeader } from "../common/Tab" // Tab component seems unused now
import { useAppTranslation } from "../../i18n/TranslationContext"
import ConfirmationDialog from "../ui/confirmation-dialog"
import SplashPage from "../common/SplashPage";
import type { Project } from "../../../../src/shared/ProjectTypes"; // Import Project
import type { NavigationPayload } from "../../types"; // Corrected import path

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
	onDone: () => void;
	initialAction?: NavigationPayload | null;
	onInitialActionConsumed?: () => void;
}

const SchedulerView = ({ onDone, initialAction, onInitialActionConsumed }: SchedulerViewProps) => {
	const { t } = useAppTranslation()
	const { customModes, projects, projectSchedules, activeProjectId, setActiveProjectId } = useExtensionState();
	
	// Add logging for component initialization
	console.log("SchedulerView component initialized, activeProjectId:", activeProjectId);
	
	// Tab state
	const [activeTab, setActiveTab] = useState<string>("schedules") // "schedules" or "edit"
	
	// Schedule list state - now derived from context based on activeProjectId
	const schedules: Schedule[] = useMemo(() => {
		if (activeProjectId && projectSchedules && projectSchedules[activeProjectId]) {
			return projectSchedules[activeProjectId] as Schedule[]; // Cast as Schedule (UI type)
		}
		return [];
	}, [activeProjectId, projectSchedules]);

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
	// No need for default start time effect - handled in ScheduleForm
	
	// useEffect to load schedules is no longer needed here as schedules are derived from context.
	// The context (ExtensionStateContext) will update when `projectSchedules` changes.
	// The `schedulesUpdated` message from the backend will trigger a state update in ClineProvider,
	// which then propagates to the webview context.

	useEffect(() => {
		if (initialAction?.view === 'form' && onInitialActionConsumed) {
			resetForm(); // Clear any previous editing state
			if (initialAction.itemId && initialAction.projectId) {
				// Editing an existing schedule
				console.log("SchedulerView: Processing initialAction to EDIT form for schedule:", initialAction.itemId, "in project:", initialAction.projectId);
				const projectSchedulesMap = projectSchedules || {};
				const schedulesForProject = projectSchedulesMap[initialAction.projectId] || [];
				const scheduleToEdit = schedulesForProject.find(s => s.id === initialAction.itemId);
				if (scheduleToEdit) {
					setSelectedScheduleId(scheduleToEdit.id);
					setInitialFormData({ ...scheduleToEdit }); // Populate form with existing data
					setIsEditing(true);
					setActiveTab("edit");
				} else {
					console.warn(`SchedulerView: Schedule with id ${initialAction.itemId} not found in project ${initialAction.projectId}`);
					// Fallback to new schedule form for the project, or handle error
					setInitialFormData({ projectId: initialAction.projectId });
					setIsEditing(false);
					setActiveTab("edit");
				}
			} else if (initialAction.projectId) {
				// Creating a new schedule for a specific project
				console.log("SchedulerView: Processing initialAction to CREATE new form for project:", initialAction.projectId);
				setInitialFormData({ projectId: initialAction.projectId });
				setIsEditing(false);
				setActiveTab("edit");
			} else {
	       // Creating a new schedule without a pre-selected project (form will require selection)
	       console.log("SchedulerView: Processing initialAction to CREATE new form (no project pre-selected)");
	       setIsEditing(false);
	       setActiveTab("edit");
	     }
			onInitialActionConsumed(); // Notify App.tsx that the action has been processed
		}
	}, [initialAction, onInitialActionConsumed, projectSchedules]);

	// Save schedule (now to a project)
	// formData now includes projectId from the ScheduleForm
	const saveSchedule = (formData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string }) => {
		if (!formData.name.trim()) {
			console.error("Schedule name cannot be empty");
			return;
		}
		if (!formData.projectId) {
			console.error("Project ID is missing in form data. Cannot save schedule.");
			// This should ideally be caught by form validation
			return;
		}
		
		const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode);
		const modeDisplayName = selectedModeConfig?.name || formData.mode;

		// The schedulePayload will already have projectId from the form.
		const schedulePayload = { ...formData, modeDisplayName };

		if (isEditing && selectedScheduleId) {
			const existingSchedule = schedules.find(s => s.id === selectedScheduleId);
			if (existingSchedule) {
				// When updating, the projectId in schedulePayload (from form) should match existingSchedule.projectId
				// or we need a mechanism to move schedules (not in scope for this change).
				// For now, assume projectId from form is the correct one for the update.
				vscode.postMessage({
					type: "updateScheduleInProject",
					projectId: schedulePayload.projectId, // Use projectId from form for targeting project
					data: { ...existingSchedule, ...schedulePayload } as Schedule, // Ensure all fields for BaseSchedule
				});
			}
		} else {
			// Create new schedule, use projectId from form
			vscode.postMessage({
				type: "addScheduleToProject",
				projectId: schedulePayload.projectId, // Use projectId from form for targeting project
				data: schedulePayload, // data already contains projectId
			});
		}
		
		resetForm();
		setActiveTab("schedules");
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
	
	// Delete schedule (from a project)
	const deleteSchedule = (scheduleId: string) => {
		if (!activeProjectId) {
			console.error("Cannot delete schedule: No active project selected.");
			return;
		}
		vscode.postMessage({
			type: "deleteScheduleFromProject",
			projectId: activeProjectId,
			scheduleId: scheduleId,
		});

		if (selectedScheduleId === scheduleId) {
			resetForm();
		}
	}
	
	// Reset form
	const resetForm = () => {
		setSelectedScheduleId(null)
		setInitialFormData({})
		setIsEditing(false)
	}
	
	// Create new schedule (for the active project, or allow form to select)
	const createNewSchedule = () => {
		// activeProjectId will be used by ScheduleForm to pre-select the project if set.
		// If not set, ScheduleForm's dropdown will be mandatory.
		// No need for a hard block here anymore as the form handles project selection.
		resetForm();
		// Pass activeProjectId to initialFormData for the form to pick up
		setInitialFormData(prev => ({ ...prev, projectId: activeProjectId || undefined }));
		setActiveTab("edit");
	}

	const onRunNowHandler = (scheduleId: string) => {
		if (!activeProjectId) {
			console.error("Cannot run schedule: No active project selected.");
			// Optionally, show a user-facing error message here
			return;
		}
		vscode.postMessage({
			type: "runScheduleNow",
			scheduleId: scheduleId,
			projectId: activeProjectId, // Add projectId to the message
		});
	};
	
	// (Sorting logic and helper moved to ScheduleSortControl)

	return (
		<div className="h-full flex flex-col">
			{/* Header section removed as per new instructions */}
			
			{/* Inner Tabs for list/edit form */}
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow pt-2"> {/* Added pt-2 */}
				<TabsContent value="schedules" className="space-y-2 flex-1 overflow-auto px-2"> {/* Added px-2 */}
						{!activeProjectId ? (
							<div className="text-center py-8 text-vscode-descriptionForeground">
								Please select or create a project to manage schedules.
							</div>
						) : schedules.length === 0 ? (
							<SplashPage />
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
											projects={projects || []} // Pass projects array, defaulting to empty if undefined
											onEdit={editSchedule}
											onDelete={(id) => {
												setScheduleToDelete(id);
												setDialogOpen(true);
											}}
											onToggleActive={(id, active) => {
												if (!activeProjectId) return;
												const scheduleToUpdate = schedules.find(s => s.id === id);
												if (scheduleToUpdate) {
													vscode.postMessage({
														type: "updateScheduleInProject",
														projectId: activeProjectId,
														data: { ...scheduleToUpdate, active, projectId: activeProjectId } as Schedule,
													});
												}
											}}
											onRunNow={onRunNowHandler}
											onDuplicate={(scheduleId) => {
												if (!activeProjectId) return;
												// Backend needs to handle duplication within the project context
												// For now, this might require a new message type like "duplicateScheduleInProject"
												// or the existing "duplicateSchedule" needs to be aware of activeProjectId.
												// Let's assume for now backend handles it via a generic duplicate message
												// and we might need to adjust if it needs projectId explicitly.
												// OR, we can implement duplication on the frontend and then save as new.
												const scheduleToDuplicate = schedules.find(s => s.id === scheduleId);
												if (scheduleToDuplicate) {
													const { id, createdAt, updatedAt, nextExecutionTime, lastExecutionTime, lastSkippedTime, lastTaskId, executionCount, projectId: projectToDuplicateIn, ...duplicableData } = scheduleToDuplicate;
													// Ensure the duplicated schedule is associated with a project.
													// If activeProjectId is available and different, it might imply duplicating to current project.
													// For simplicity, duplicate within the same project as the original.
													saveSchedule({
														...duplicableData,
														projectId: projectToDuplicateIn, // Explicitly set projectId
														name: `${duplicableData.name} (Copy)`,
														active: false, // Duplicates are inactive by default
													} as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string });
												}
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
						
					<TabsContent value="edit" className="flex-1 overflow-auto px-2"> {/* Added px-2 and flex-1 */}
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
						      {/* Save and Cancel buttons for the form */}
						      {activeTab === "edit" && (
						        <div className="flex justify-end gap-2 mt-4 p-1 border-t border-vscode-panel-border">
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
						      )}
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
