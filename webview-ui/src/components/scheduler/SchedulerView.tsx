import React, { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "../../components/ui/button"
import { Tabs, TabsContent } from "../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select" 
import { useExtensionState } from "../../context/ExtensionStateContext"
import { getAllModes } from "../../../../src/shared/modes"
import { vscode } from "../../utils/vscode"
import ConfirmationDialog from "../ui/confirmation-dialog"
import SplashPage from "../common/SplashPage";
import FilterInput from "../common/FilterInput"; // Added FilterInput
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

const SchedulerView = ({ initialAction, onInitialActionConsumed }: SchedulerViewProps) => {
	const { customModes, projects, projectSchedules, activeProjectId } = useExtensionState();
	
	const [filterProjectId, setFilterProjectId] = useState<string>("all"); 
	const [activeTab, setActiveTab] = useState<string>("schedules") 
	const [filterText, setFilterText] = useState(''); // State for filter text

	const schedulesToDisplayInitially: Schedule[] = useMemo(() => {
		if (!projectSchedules) return [];
		if (filterProjectId === "all") {
			return Object.values(projectSchedules).flat() as Schedule[];
		}
		return (projectSchedules[filterProjectId] || []) as Schedule[];
	}, [filterProjectId, projectSchedules]);

	const displayedSchedules: Schedule[] = useMemo(() => {
    if (!filterText.trim()) return schedulesToDisplayInitially;
    const lowerFilterText = filterText.toLowerCase();
    return schedulesToDisplayInitially.filter(schedule => 
      schedule.name.toLowerCase().includes(lowerFilterText) ||
      (schedule.taskInstructions && schedule.taskInstructions.toLowerCase().includes(lowerFilterText)) ||
      (schedule.modeDisplayName && schedule.modeDisplayName.toLowerCase().includes(lowerFilterText)) ||
      (schedule.mode && schedule.mode.toLowerCase().includes(lowerFilterText))
    );
  }, [schedulesToDisplayInitially, filterText]);

	const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
	
	type SortMethod = "nextExecution" | "lastExecution" | "lastUpdated" | "created" | "activeStatus"
	type SortDirection = "asc" | "desc"
	
	const [sortMethod, setSortMethod] = useState<SortMethod>(() => {
		const savedMethod = localStorage.getItem('roo-scheduler-sort-method');
		return (savedMethod as SortMethod) || "created";
	});
	
	const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
		const savedDirection = localStorage.getItem('roo-scheduler-sort-direction');
		return (savedDirection as SortDirection) || "desc";
	});
	
	useEffect(() => {
		localStorage.setItem('roo-scheduler-sort-method', sortMethod);
	}, [sortMethod]);
	
	useEffect(() => {
		localStorage.setItem('roo-scheduler-sort-direction', sortDirection);
	}, [sortDirection]);
	
	const [isEditing, setIsEditing] = useState<boolean>(false)
	const [initialFormData, setInitialFormData] = useState<Partial<Schedule>>({})
	
	const [dialogOpen, setDialogOpen] = useState(false)
	const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null)
	
	const availableModes = useMemo(() => getAllModes(customModes), [customModes])

	const scheduleFormRef = useRef<ScheduleFormHandle>(null);
	const [isFormValid, setIsFormValid] = useState(false);

	const handleCreateNewProjectRequest = () => {
		vscode.postMessage({ type: 'navigateToNewProjectForm' });
	};
	
	useEffect(() => {
		if (initialAction?.view === 'form' && onInitialActionConsumed) {
			resetForm(); 
			if (initialAction.itemId && initialAction.projectId) {
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
					setFilterProjectId(initialAction.projectId); 
					setInitialFormData({ projectId: initialAction.projectId });
					setIsEditing(false);
					setActiveTab("edit");
				}
			} else if (initialAction.projectId) {
				setInitialFormData({ projectId: initialAction.projectId });
				setIsEditing(false);
				setActiveTab("edit");
			} else {
	       setIsEditing(false);
	       setActiveTab("edit");
	     }
			onInitialActionConsumed(); 
		}
	}, [initialAction, onInitialActionConsumed, projectSchedules]);

	const saveSchedule = (formData: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string }) => {
		if (!formData.name.trim()) return;
		if (!formData.projectId) return;
		
		const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode);
		const modeDisplayName = selectedModeConfig?.name || formData.mode;
		const schedulePayload = { ...formData, modeDisplayName };

		if (isEditing && selectedScheduleId) {
			const existingSchedule = schedulesToDisplayInitially.find(s => s.id === selectedScheduleId); 
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
		const schedule = schedulesToDisplayInitially.find(s => s.id === scheduleId); 
		if (schedule) {
			setSelectedScheduleId(scheduleId)
			if (schedule.projectId) setFilterProjectId(schedule.projectId); 
			setInitialFormData(schedule);
			setIsEditing(true);
			setActiveTab("edit");
		}
	}
	
	const deleteSchedule = (scheduleId: string) => {
		const scheduleToDeleteRef = schedulesToDisplayInitially.find(s => s.id === scheduleId);
		const finalProjectId = scheduleToDeleteRef?.projectId || (filterProjectId !== "all" ? filterProjectId : activeProjectId);
		if (!finalProjectId) return;
		vscode.postMessage({ type: "deleteScheduleFromProject", projectId: finalProjectId, scheduleId });
		if (selectedScheduleId === scheduleId) resetForm();
	}
	
	const resetForm = () => {
		setSelectedScheduleId(null);
		setInitialFormData({});
		setIsEditing(false);
	}
	
	const createNewSchedule = () => {
		resetForm();
		const targetProjectId = filterProjectId !== "all" ? filterProjectId : activeProjectId || projects?.[0]?.id;
		if (!targetProjectId && (!projects || projects.length === 0)) {
			handleCreateNewProjectRequest();
			return;
		}
		setInitialFormData({ projectId: targetProjectId });
		setActiveTab("edit");
	}

	const onRunNowHandler = (scheduleId: string, projectId?: string) => {
		let targetProjectId = projectId;
		if (!targetProjectId) {
			const schedule = schedulesToDisplayInitially.find(s => s.id === scheduleId);
			targetProjectId = schedule?.projectId;
		}
		if (!targetProjectId && filterProjectId !== "all") targetProjectId = filterProjectId;
		if (!targetProjectId) return;
		vscode.postMessage({ type: "runScheduleNow", scheduleId, projectId: targetProjectId });
	};
	
	const renderContent = () => {
		// If no items after filtering, but there were items before filtering for this project view
		if (displayedSchedules.length === 0 && schedulesToDisplayInitially.length > 0) {
			return (
				<div className="h-full flex flex-col">
					<div className="flex items-center justify-between gap-2 mb-2 px-1 pt-1">
						<div className="flex items-center gap-2">
							<label htmlFor="project-filter-scheduler" className="text-sm text-vscode-descriptionForeground">Project:</label>
							<Select value={filterProjectId} onValueChange={setFilterProjectId}>
								<SelectTrigger id="project-filter-scheduler" className="w-[180px] h-9 text-xs rounded-lg"> {/* Applied h-9 and rounded-lg */}
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
						<FilterInput 
							value={filterText}
							onValueChange={setFilterText}
							placeholder="Filter schedules..."
							className="w-[220px] mb-2"
						/>
					</div>
					<div className="text-center py-8 text-vscode-descriptionForeground">
						No schedules match your filter.
					</div>
				</div>
			);
		}
		
		// If no items at all for the current project/all filter (before text filtering)
		if (schedulesToDisplayInitially.length === 0) {
			return (
				<SplashPage 
					tabType="schedules" 
					showCreateProjectHelper={!projects || projects.length === 0}
					onCreateProject={handleCreateNewProjectRequest}
				/>
			);
		}

		// If we reach here, displayedSchedules.length > 0 (after potential text filtering)
		return (
			<div className="h-full flex flex-col">
				{/* Filter Input on its own line */}
				<div className="px-1 pt-1"> {/* Removed mb-2 from here, FilterInput has it */}
					<FilterInput 
						value={filterText}
						onValueChange={setFilterText}
						placeholder="Filter schedules..."
						className="w-full max-w-md mb-2" // Use more width, keep mb-2
					/>
				</div>
				{/* Project Select and Sort Controls on the next line */}
				{/* ScheduleSortControl now handles the sort UI, so we only need project filter here if not part of sort control */}
				<div className="flex items-center justify-start gap-2 mb-2 px-1"> {/* Changed to justify-start */}
					<div className="flex items-center gap-2">
						<label htmlFor="project-filter-scheduler" className="text-sm text-vscode-descriptionForeground">Project:</label>
						<Select value={filterProjectId} onValueChange={setFilterProjectId}>
							<SelectTrigger id="project-filter-scheduler" className="w-[180px] h-9 text-xs rounded-lg">
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
					{/* Sort controls are now inside ScheduleSortControl */}
				</div>
				<ScheduleSortControl
					schedules={displayedSchedules} // Use text-filtered schedules for sorting
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
							onDelete={(id) => { setScheduleToDelete(id); setDialogOpen(true); }}
							onToggleActive={(id: string, currentActiveState: boolean) => {
								const schedule = schedulesToDisplayInitially.find(s => s.id === id);
								if (schedule && schedule.projectId) {
									vscode.postMessage({
										type: "updateScheduleInProject",
										projectId: schedule.projectId,
										data: { ...schedule, active: !currentActiveState } as Schedule,
									});
								}
							}}
							onRunNow={(scheduleId: string) => {
								const schedule = schedulesToDisplayInitially.find(s => s.id === scheduleId);
								onRunNowHandler(scheduleId, schedule?.projectId);
							}}
							onDuplicate={(scheduleId: string) => {
								const scheduleToDuplicate = schedulesToDisplayInitially.find(s => s.id === scheduleId);
								if (scheduleToDuplicate && scheduleToDuplicate.projectId) {
									const { id, createdAt, updatedAt, nextExecutionTime, lastExecutionTime, lastSkippedTime, lastTaskId, executionCount, ...duplicableData } = scheduleToDuplicate;
									saveSchedule({
										...(duplicableData as Omit<Schedule, 'id'|'createdAt'|'updatedAt'|'nextExecutionTime'|'lastExecutionTime'|'lastSkippedTime'|'lastTaskId'|'executionCount'>),
										name: `${(duplicableData as { name?: string }).name || 'Schedule'} (Copy)`,
										active: false,
										projectId: scheduleToDuplicate.projectId,
									} as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string });
								}
							}}
							onResumeTask={(taskId) => vscode.postMessage({ type: "resumeTask", taskId })}
							formatDate={formatDateWithoutYearAndSeconds}
						/>
					)}
				</ScheduleSortControl>
			</div> 
		);
	};

	return (
		<div className="h-full flex flex-col">
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow pt-2">
				<TabsContent value="schedules" className="space-y-2 flex-1 overflow-auto px-2">
					{renderContent()}
				</TabsContent>
						
				<TabsContent value="edit" className="flex-1 overflow-auto px-2">
					<ScheduleForm
						ref={scheduleFormRef}
						initialData={initialFormData}
						isEditing={isEditing}
						availableModes={availableModes}
						onSave={saveSchedule}
						onCancel={() => { resetForm(); setActiveTab("schedules"); }}
						onValidityChange={setIsFormValid}
					/>
					{activeTab === "edit" && (
						<div className="flex justify-end gap-2 mt-4 p-1 border-t border-vscode-panel-border">
							<Button variant="secondary" size="sm" onClick={() => { resetForm(); setActiveTab("schedules");}}>Cancel</Button>
							<Button size="sm" onClick={() => scheduleFormRef.current?.submitForm()} disabled={!isFormValid}>Save Schedule</Button>
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
				onConfirm={() => { if (scheduleToDelete) { deleteSchedule(scheduleToDelete); setScheduleToDelete(null); }}}
				confirmClassName="bg-vscode-errorForeground hover:bg-vscode-errorForeground/90"
			/>
		</div>
	)
}

export default SchedulerView
