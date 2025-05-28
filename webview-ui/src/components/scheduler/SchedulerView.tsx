import React, { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "../../components/ui/button"
import { Tabs, TabsContent } from "../../components/ui/tabs" // TabsList and TabsTrigger are not used
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select" 
import { Virtuoso } from "react-virtuoso"
import { cn } from "../../lib/utils"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { 
	getAllModes,
} from "../../../../src/shared/modes"
import { vscode } from "../../utils/vscode"
import { useAppTranslation } from "../../i18n/TranslationContext"
import ConfirmationDialog from "../ui/confirmation-dialog"
import SplashPage from "../common/SplashPage";
import type { Project } from "../../../../src/shared/ProjectTypes"; 
import type { NavigationPayload } from "../../types"; 

import ScheduleForm from "./ScheduleForm"
import type { ScheduleFormHandle } from "./ScheduleForm"
import { Schedule } from "./types" 
import ScheduleSortControl from "./ScheduleSortControl"
import ScheduleList from "./ScheduleList"

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
	
	console.log("SchedulerView component initialized, activeProjectId:", activeProjectId);

	const [filterProjectId, setFilterProjectId] = useState<string>("all"); 
	
	const [activeTab, setActiveTab] = useState<string>("schedules") 
	
	const displayedSchedules: Schedule[] = useMemo(() => {
		if (!projectSchedules) return [];
		if (filterProjectId === "all") {
			return Object.values(projectSchedules).flat() as Schedule[];
		}
		return (projectSchedules[filterProjectId] || []) as Schedule[];
	}, [filterProjectId, projectSchedules]);

	const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
	
	type SortMethod = "nextExecution" | "lastExecution" | "lastUpdated" | "created" | "activeStatus"
	type SortDirection = "asc" | "desc"
	
	const [sortMethod, setSortMethod] = useState<SortMethod>(() => {
		const savedMethod = localStorage.getItem('roo-sort-method');
		return (savedMethod as SortMethod) || "created";
	});
	
	const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
		const savedDirection = localStorage.getItem('roo-sort-direction');
		return (savedDirection as SortDirection) || "desc";
	});
	
	useEffect(() => {
		localStorage.setItem('roo-sort-method', sortMethod);
	}, [sortMethod]);
	
	useEffect(() => {
		localStorage.setItem('roo-sort-direction', sortDirection);
	}, [sortDirection]);
	
	const [isEditing, setIsEditing] = useState<boolean>(false)
	const [initialFormData, setInitialFormData] = useState<Partial<Schedule>>({})
	
	const [dialogOpen, setDialogOpen] = useState(false)
	const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null)
	
	const availableModes = useMemo(() => getAllModes(customModes), [customModes])

	const scheduleFormRef = useRef<ScheduleFormHandle>(null);
	const [isFormValid, setIsFormValid] = useState(false);

	useEffect(() => {
		if (initialAction?.view === 'form' && onInitialActionConsumed) {
			resetForm(); 
			if (initialAction.itemId && initialAction.projectId) {
				console.log("SchedulerView: Processing initialAction to EDIT form for schedule:", initialAction.itemId, "in project:", initialAction.projectId);
				const projectSchedulesMap = projectSchedules || {};
				const schedulesForProject = projectSchedulesMap[initialAction.projectId] || [];
				const scheduleToEdit = schedulesForProject.find(s => s.id === initialAction.itemId);
				if (scheduleToEdit) {
					setFilterProjectId(initialAction.projectId); 
					setSelectedScheduleId(scheduleToEdit.id);
					setInitialFormData({ ...scheduleToEdit }); 
					setIsEditing(true);
					setActiveTab("edit");
				} else {
					console.warn(`SchedulerView: Schedule with id ${initialAction.itemId} not found in project ${initialAction.projectId}`);
					setFilterProjectId(initialAction.projectId); 
					setInitialFormData({ projectId: initialAction.projectId });
					setIsEditing(false);
					setActiveTab("edit");
				}
			} else if (initialAction.projectId) {
				console.log("SchedulerView: Processing initialAction to CREATE new form for project:", initialAction.projectId);
				setInitialFormData({ projectId: initialAction.projectId });
				setIsEditing(false);
				setActiveTab("edit");
			} else {
	       console.log("SchedulerView: Processing initialAction to CREATE new form (no project pre-selected)");
	       setIsEditing(false);
	       setActiveTab("edit");
	     }
			onInitialActionConsumed(); 
		}
	}, [initialAction, onInitialActionConsumed, projectSchedules]);

	const saveSchedule = (formData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string }) => {
		if (!formData.name.trim()) {
			console.error("Schedule name cannot be empty");
			return;
		}
		if (!formData.projectId) {
			console.error("Project ID is missing in form data. Cannot save schedule.");
			return;
		}
		
		const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode);
		const modeDisplayName = selectedModeConfig?.name || formData.mode;

		const schedulePayload = { ...formData, modeDisplayName };

		if (isEditing && selectedScheduleId) {
			const existingSchedule = displayedSchedules.find(s => s.id === selectedScheduleId); 
			if (existingSchedule) {
				vscode.postMessage({
					type: "updateScheduleInProject",
					projectId: schedulePayload.projectId, 
					data: { ...existingSchedule, ...schedulePayload } as Schedule, 
				});
			}
		} else {
			vscode.postMessage({
				type: "addScheduleToProject",
				projectId: schedulePayload.projectId, 
				data: schedulePayload, 
			});
		}
		
		resetForm();
		setActiveTab("schedules");
	}

	const editSchedule = (scheduleId: string) => {
		const schedule = displayedSchedules.find(s => s.id === scheduleId); 
		if (schedule) {
			setSelectedScheduleId(scheduleId)
			if (schedule.projectId) {
				setFilterProjectId(schedule.projectId); 
			}
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
	
	const deleteSchedule = (scheduleId: string) => {
		const scheduleToDeleteRef = displayedSchedules.find(s => s.id === scheduleId);
		const finalProjectId = scheduleToDeleteRef?.projectId || (filterProjectId !== "all" ? filterProjectId : activeProjectId);

		if (!finalProjectId) {
			console.error("Cannot delete schedule: Project ID could not be determined.");
			return;
		}
		vscode.postMessage({
			type: "deleteScheduleFromProject",
			projectId: finalProjectId,
			scheduleId: scheduleId,
		});

		if (selectedScheduleId === scheduleId) {
			resetForm();
		}
	}
	
	const resetForm = () => {
		setSelectedScheduleId(null)
		setInitialFormData({})
		setIsEditing(false)
	}
	
	const createNewSchedule = () => {
		resetForm();
		setInitialFormData(prev => ({ ...prev, projectId: filterProjectId !== "all" ? filterProjectId : activeProjectId || undefined }));
		setActiveTab("edit");
	}

	const onRunNowHandler = (scheduleId: string, projectId?: string) => {
		let targetProjectId = projectId;
		if (!targetProjectId) {
			const schedule = displayedSchedules.find(s => s.id === scheduleId);
			targetProjectId = schedule?.projectId;
		}
		if (!targetProjectId && filterProjectId !== "all") {
			targetProjectId = filterProjectId;
		}
		if (!targetProjectId) {
			console.error("Cannot run schedule: Project ID is missing and could not be determined for schedule", scheduleId);
			return;
		}
		vscode.postMessage({
			type: "runScheduleNow",
			scheduleId: scheduleId,
			projectId: targetProjectId,
		});
	};
	
	return (
		<div className="h-full flex flex-col">
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow pt-2">
				<TabsContent value="schedules" className="space-y-2 flex-1 overflow-auto px-2">
					{(filterProjectId === "all" && (!projects || projects.length === 0)) ? (
						<div className="text-center py-8 text-vscode-descriptionForeground">
							Please create a project to manage schedules.
						</div>
					) : displayedSchedules.length === 0 && filterProjectId === "all" ? (
						<SplashPage tabType="schedules" />
					) : displayedSchedules.length === 0 && filterProjectId !== "all" ? (
						<div className="text-center py-8 text-vscode-descriptionForeground">
							No schedules found for this project. <Button variant="link" className="p-0 h-auto" onClick={() => createNewSchedule()}>Create one?</Button>
						</div>
					) : (
						<div className="h-full flex flex-col"> {/* Parent div for content when schedules exist */}
							<div className="flex items-center justify-between gap-2 mb-2 px-1 pt-1"> {/* Controls container */}
								<div className="flex items-center gap-2"> {/* Filter container */}
									<label htmlFor="project-filter-scheduler" className="text-sm text-vscode-descriptionForeground">Project:</label>
									<Select value={filterProjectId} onValueChange={setFilterProjectId}>
										<SelectTrigger id="project-filter-scheduler" className="w-[180px] h-8 text-xs">
											<SelectValue placeholder="Filter by project" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Projects</SelectItem>
											{projects?.map((project) => (
												<SelectItem key={project.id} value={project.id}>
													{project.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								{/* SortControl UI elements are rendered by itself or it's just a logic wrapper.
								    Assuming it renders its own UI for sort selection based on its name.
									If ScheduleSortControl is just a logic wrapper, its UI would be here.
									The error "children missing" implies it uses a render prop for the list.
								*/}
							</div>

							<ScheduleSortControl
								schedules={displayedSchedules}
								sortMethod={sortMethod}
								setSortMethod={setSortMethod}
								sortDirection={sortDirection}
								setSortDirection={setSortDirection}
							>
								{(sortedSchedules) => (
									<ScheduleList
										schedules={sortedSchedules}
										projects={projects || []}
										onEdit={editSchedule}
										onDelete={(id) => {
											setScheduleToDelete(id);
											setDialogOpen(true);
										}}
										onToggleActive={(id: string, active: boolean) => {
											const schedule = displayedSchedules.find(s => s.id === id);
											if (schedule && schedule.projectId) {
												vscode.postMessage({
													type: "updateScheduleInProject",
													projectId: schedule.projectId,
													data: { ...schedule, active } as Schedule,
												});
											} else {
												console.error("Cannot toggle active: Schedule or its projectId not found for id:", id);
											}
										}}
										onRunNow={(scheduleId: string) => {
											const schedule = displayedSchedules.find(s => s.id === scheduleId);
											onRunNowHandler(scheduleId, schedule?.projectId);
										}}
										onDuplicate={(scheduleId: string) => {
											const scheduleToDuplicate = displayedSchedules.find(s => s.id === scheduleId);
											if (scheduleToDuplicate && scheduleToDuplicate.projectId) {
												const { id, createdAt, updatedAt, nextExecutionTime, lastExecutionTime, lastSkippedTime, lastTaskId, executionCount, ...duplicableData } = scheduleToDuplicate;
												saveSchedule({
													...(duplicableData as Omit<Schedule, 'id'|'createdAt'|'updatedAt'|'nextExecutionTime'|'lastExecutionTime'|'lastSkippedTime'|'lastTaskId'|'executionCount'>),
													name: `${(duplicableData as { name?: string }).name || 'Schedule'} (Copy)`,
													active: false,
													projectId: scheduleToDuplicate.projectId, // Ensure projectId is explicitly passed
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
						
				<TabsContent value="edit" className="flex-1 overflow-auto px-2">
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
