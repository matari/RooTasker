import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from "react"
import { Button, Input, Badge, RadioGroup, RadioGroupItem } from "@/components/ui" // Added RadioGroup
import { useExtensionState } from "../../context/ExtensionStateContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AutosizeTextarea } from "@/components/ui/autosize-textarea"
import { ModeConfig } from "../../../../src/shared/modes"
import { Prompt } from "../../../../src/shared/ProjectTypes"; // Added Prompt import
import { Schedule } from "./types"
import LabeledInput from "./LabeledInput"
import DaySelector from "./DaySelector"
import DateTimeSelector from "./DateTimeSelector"
import Checkbox from "@/components/ui/checkbox"
import { start } from "repl"

export type ScheduleFormData = Omit<Schedule, "id" | "createdAt" | "updatedAt" | "modeDisplayName">

// Make all fields required and non-undefined for local form state
type RequiredScheduleFormData = {
	[K in keyof ScheduleFormData]-?: NonNullable<ScheduleFormData[K]>
}

interface ScheduleFormProps {
	initialData?: Partial<ScheduleFormData>
	isEditing: boolean
	availableModes: ModeConfig[]
	onSave: (formData: ScheduleFormData) => void
	onCancel: () => void
	onValidityChange?: (isValid: boolean) => void
}

export interface ScheduleFormHandle {
	submitForm: () => void
}
const TIME_UNITS = [
	{ value: "minute", label: "Minute(s)" },
	{ value: "hour", label: "Hour(s)" },
	{ value: "day", label: "Day(s)" },
]

const defaultDays: Record<string, boolean> = {
	sun: false,
	mon: false,
	tue: false,
	wed: false,
	thu: false,
	fri: false,
	sat: false,
}
const allDaysSelected: Record<string, boolean> = {
	sun: true,
	mon: true,
	tue: true,
	wed: true,
	thu: true,
	fri: true,
	sat: true,
}

const getDefinedForm = (initialData?: Partial<ScheduleFormData>): RequiredScheduleFormData => ({
  projectId: initialData?.projectId ?? "", // Added projectId
  name: initialData?.name ?? "",
  mode: initialData?.mode ?? "code",
	taskInstructions: initialData?.taskInstructions ?? "",
  promptSelectionType: initialData?.promptSelectionType ?? "custom",
  savedPromptId: initialData?.savedPromptId ?? "",
	scheduleKind: initialData?.scheduleKind ?? "interval",
	recurrenceType: initialData?.recurrenceType ?? "daily",
	recurrenceDay: initialData?.recurrenceDay ?? 1,
	recurrenceMonth: initialData?.recurrenceMonth ?? 1,
	cronExpression: initialData?.cronExpression ?? "",
	timeInterval: initialData?.timeInterval ?? "1",
	timeUnit: initialData?.timeUnit ?? "hour",
	selectedDays: initialData?.selectedDays ?? { ...defaultDays },
	startDate: initialData?.startDate ?? "",
	startHour: initialData?.startHour ?? "00",
	startMinute: initialData?.startMinute ?? "00",
	expirationDate: initialData?.expirationDate ?? "",
	expirationHour: initialData?.expirationHour ?? "00",
	expirationMinute: initialData?.expirationMinute ?? "00",
	maxExecutions: initialData?.maxExecutions ?? 0,
	executionCount: initialData?.executionCount ?? 0,
	requireActivity: initialData?.requireActivity ?? false,
	active: initialData?.active ?? true,
	taskInteraction: initialData?.taskInteraction ?? "wait",
	inactivityDelay: initialData?.inactivityDelay ?? "10", // Default to 10 minutes
	lastExecutionTime: initialData?.lastExecutionTime ?? "",
	lastSkippedTime: initialData?.lastSkippedTime ?? "",
	lastTaskId: initialData?.lastTaskId ?? "",
	nextExecutionTime: initialData?.nextExecutionTime ?? "",
})

const ScheduleForm = forwardRef<ScheduleFormHandle, ScheduleFormProps>(
	({ initialData, isEditing, availableModes, onSave, onCancel, onValidityChange }, ref) => {
		const { projects, activeProjectId, prompts } = useExtensionState(); // Added prompts
		const [activeScheduleKindTab, setActiveScheduleKindTab] = useState<"one-time" | "interval" | "cron" | "recurring">(
			initialData?.scheduleKind || "interval",
		)
		// Initialize promptSelectionType based on initialData or default to 'custom'
		const [promptSelectionType, setPromptSelectionType] = useState<'custom' | 'saved'>(
			initialData?.promptSelectionType || 'custom'
		);

		// For new schedules, we'll use allDaysSelected (all true) as the initial state
		// For editing, use the provided selectedDays or defaultDays
		// Also, set projectId from activeProjectId if creating new and not already set in initialData
		const effectiveInitialData = useMemo(() => {
			let data = initialData;
			if (!isEditing) {
				if (!data || !data.selectedDays) {
					data = { ...data, selectedDays: { ...allDaysSelected } };
				}
				if (!data || !data.projectId) {
					data = { ...data, projectId: activeProjectId || "" };
				}
			}
			return data;
		}, [initialData, isEditing, activeProjectId]);


		const [form, setForm] = useState<RequiredScheduleFormData>(
			getDefinedForm(effectiveInitialData ? { ...effectiveInitialData, scheduleKind: activeScheduleKindTab } : { scheduleKind: activeScheduleKindTab, projectId: activeProjectId || "" }),
		)
		const [hasStartDate, setHasStartDate] = useState<boolean>(!!effectiveInitialData?.startDate)
		const [hasExpiration, setHasExpiration] = useState<boolean>(!!effectiveInitialData?.expirationDate)

		// Determine if any days of the week are not selected (for editing mode)
		const anyDaysNotSelected = useMemo(() => {
			if (!form.selectedDays) return false
			return Object.values(form.selectedDays).some((selected) => !selected)
		}, [form.selectedDays])

		// For new schedules, default to false. For editing, check if any days are not selected
		const [hasDaysOfWeek, setHasDaysOfWeek] = useState<boolean>(isEditing ? anyDaysNotSelected : false)

		// Validation state for parent
		const isValid = useMemo(() => {
			const baseValid =
				!!form.name.trim() &&
				!!form.mode &&
				!!form.projectId && 
				(form.taskInteraction !== "wait" ||
					(!!form.inactivityDelay && !isNaN(Number(form.inactivityDelay)) && Number(form.inactivityDelay) > 0));
			
			const promptValid = form.promptSelectionType === 'custom' ? !!form.taskInstructions.trim() : !!form.savedPromptId;

			if (!baseValid || !promptValid) return false;

			if (!baseValid) return false;

			switch (form.scheduleKind) {
				case "one-time":
					return !!form.startDate && !!form.startHour && !!form.startMinute;
				case "interval":
					return !!form.timeInterval && !isNaN(Number(form.timeInterval)) && Number(form.timeInterval) > 0;
				case "cron":
					return !!form.cronExpression.trim();
				case "recurring":
					// Validate based on recurrence type
					const timeValid = !!form.startHour && !!form.startMinute;
					if (!timeValid) return false;
					
					switch (form.recurrenceType) {
						case "daily":
							return true; // Just needs the time
						case "weekly":
							// At least one day must be selected
							return Object.values(form.selectedDays).some(day => day === true);
						case "monthly":
							return form.recurrenceDay >= 1 && form.recurrenceDay <= 31;
						case "yearly":
							return form.recurrenceDay >= 1 && form.recurrenceDay <= 31 && 
								form.recurrenceMonth >= 1 && form.recurrenceMonth <= 12;
						default:
							return false;
					}
				default:
					return false;
			}
		}, [form]);

		// Notify parent of validity changes
		useEffect(() => {
			if (onValidityChange) onValidityChange(isValid)
		}, [isValid, onValidityChange])

		// Update form's scheduleKind when tab changes
		useEffect(() => {
			setField("scheduleKind", activeScheduleKindTab);
			// Also update promptSelectionType in main form state when local state changes
			setField("promptSelectionType", promptSelectionType);
		}, [activeScheduleKindTab, promptSelectionType])

		// Expose submitForm to parent via ref
		useImperativeHandle(ref, () => ({
			submitForm: () => {
				handleSave()
			},
		}))

		useEffect(() => {
			// Initialize form with activeProjectId if creating new and no projectId is in initialData
			if (!isEditing && (!initialData || !initialData.projectId) && activeProjectId) {
				setField("projectId", activeProjectId);
			}
			
			if (!isEditing && !effectiveInitialData?.startDate) {
				const now = new Date()
				const currentHour = now.getHours()

				// Format date in local time zone (YYYY-MM-DD)
				const year = now.getFullYear()
				const month = (now.getMonth() + 1).toString().padStart(2, "0")
				const day = now.getDate().toString().padStart(2, "0")
				const localDate = `${year}-${month}-${day}`

				setForm((f) => ({
					...f,
					startDate: localDate,
					startHour: currentHour.toString().padStart(2, "0"),
					startMinute: "00",
				}))
			}
		}, [isEditing, effectiveInitialData, hasStartDate, activeProjectId, initialData])

		const setField = <K extends keyof RequiredScheduleFormData>(key: K, value: RequiredScheduleFormData[K]) => {
			return setForm((f) => ({ ...f, [key]: value }))
		}

		const toggleDay = (day: string) =>
			setForm((f) => ({
				...f,
				selectedDays: { ...f.selectedDays, [day]: !f.selectedDays[day] },
			}))

		const validateExpirationTime = useCallback(() => {
			if (!form.startDate || !form.expirationDate) return true
			const startDateTime = new Date(`${form.startDate}T${form.startHour}:${form.startMinute}:00`)
			const expirationDateTime = new Date(
				`${form.expirationDate}T${form.expirationHour}:${form.expirationMinute}:00`,
			)
			return expirationDateTime > startDateTime
		}, [
			form.startDate,
			form.startHour,
			form.startMinute,
			form.expirationDate,
			form.expirationHour,
			form.expirationMinute,
		])

		// Handle changes to hasStartDate state
		useEffect(() => {
			if (hasStartDate && !form.startDate) {
				// If start date is enabled but no date is set, set to current date
				const now = new Date()
				const currentHour = now.getHours()

				// Format date in local time zone (YYYY-MM-DD)
				const year = now.getFullYear()
				const month = (now.getMonth() + 1).toString().padStart(2, "0")
				const day = now.getDate().toString().padStart(2, "0")
				const localDate = `${year}-${month}-${day}`

				setForm((f) => ({
					...f,
					startDate: localDate,
					startHour: currentHour.toString().padStart(2, "0"),
					startMinute: "00",
				}))
			}
		}, [hasStartDate, form.startDate])

		// Handle changes to hasExpiration state
		useEffect(() => {
			if (hasExpiration && form.startDate) {
				// When expiration is enabled, ensure expiration date is set and is after start date
				let startDateTime = new Date(`${form.startDate}T${form.startHour}:${form.startMinute}:00`)
				const currentTime = new Date()

				// Use the later of current time or start time
				const baseTime = startDateTime > currentTime ? startDateTime : currentTime

				// Check if expiration needs to be updated
				const needsUpdate =
					!form.expirationDate ||
					new Date(`${form.expirationDate}T${form.expirationHour}:${form.expirationMinute}:00`) <= baseTime

				if (needsUpdate) {
					// Set expiration to one hour after the base time
					const expirationTime = new Date(baseTime)
					expirationTime.setHours(expirationTime.getHours() + 1)

					// Format date in local time zone (YYYY-MM-DD)
					const year = expirationTime.getFullYear()
					const month = (expirationTime.getMonth() + 1).toString().padStart(2, "0")
					const day = expirationTime.getDate().toString().padStart(2, "0")
					const expirationDateFormatted = `${year}-${month}-${day}`

					// Format hour and minute
					const hour = expirationTime.getHours().toString().padStart(2, "0")
					const minute = expirationTime.getMinutes().toString().padStart(2, "0")

					setField("expirationDate", expirationDateFormatted)
					setField("expirationHour", hour)
					setField("expirationMinute", minute)
				}
			}
		}, [
			hasExpiration,
			form.expirationDate,
			form.expirationHour,
			form.expirationMinute,
			form.startDate,
			form.startHour,
			form.startMinute,
		])

		const handleSave = () => {
			if (!form.name.trim()) {
				console.error("Schedule name cannot be empty")
				return
			}
			if (form.expirationDate && !validateExpirationTime()) {
				console.error("Expiration time must be after start time")
				return
			}
	
			let formToSave: ScheduleFormData = { ...form }; // Ensure correct type for onSave
	
			// Clear fields based on scheduleKind
			if (form.scheduleKind === "one-time") {
				formToSave.cronExpression = undefined;
				formToSave.timeInterval = undefined;
				formToSave.timeUnit = undefined;
				formToSave.selectedDays = { ...defaultDays }; 
				formToSave.requireActivity = false;
				formToSave.recurrenceType = undefined;
				formToSave.recurrenceDay = undefined;
				formToSave.recurrenceMonth = undefined;
				// startDate, startHour, startMinute are essential for one-time and are set via DateTimeSelector
				// Expiration is handled by hasExpiration checkbox
			} else if (form.scheduleKind === "interval") {
				formToSave.cronExpression = undefined;
				formToSave.recurrenceType = undefined;
				formToSave.recurrenceDay = undefined;
				formToSave.recurrenceMonth = undefined;
				// Interval specific fields are managed by their inputs and checkboxes (hasStartDate, hasDaysOfWeek)
				if (!hasStartDate) {
					formToSave.startDate = undefined;
					formToSave.startHour = undefined;
					formToSave.startMinute = undefined;
				}
				if (!hasDaysOfWeek) {
					formToSave.selectedDays = { ...allDaysSelected }; // Default for interval if not specified
				}
			} else if (form.scheduleKind === "cron") {
				formToSave.timeInterval = undefined;
				formToSave.timeUnit = undefined;
				formToSave.selectedDays = { ...defaultDays };
				formToSave.startDate = undefined; 
				formToSave.startHour = undefined;
				formToSave.startMinute = undefined;
				formToSave.requireActivity = false;
				formToSave.recurrenceType = undefined;
				formToSave.recurrenceDay = undefined;
				formToSave.recurrenceMonth = undefined;
				// Expiration is handled by hasExpiration checkbox
			} else if (form.scheduleKind === "recurring") {
				formToSave.cronExpression = undefined;
				formToSave.timeInterval = undefined;
				formToSave.timeUnit = undefined;
				formToSave.startDate = undefined;
				formToSave.requireActivity = false;
				
				// Clear fields based on recurrence type
				if (form.recurrenceType === "daily") {
					formToSave.selectedDays = { ...defaultDays };
					formToSave.recurrenceDay = undefined;
					formToSave.recurrenceMonth = undefined;
				} else if (form.recurrenceType === "weekly") {
					formToSave.recurrenceDay = undefined;
					formToSave.recurrenceMonth = undefined;
					// selectedDays is already set by the UI
				} else if (form.recurrenceType === "monthly") {
					formToSave.selectedDays = { ...defaultDays };
					formToSave.recurrenceMonth = undefined;
					// recurrenceDay is already set by the UI
				} else if (form.recurrenceType === "yearly") {
					formToSave.selectedDays = { ...defaultDays };
					// recurrenceDay and recurrenceMonth are already set by the UI
				}
				
				// Set executionCount to 0 if maxExecutions is enabled
				if (!formToSave.maxExecutions || formToSave.maxExecutions <= 0) {
					formToSave.maxExecutions = undefined;
					formToSave.executionCount = undefined;
				} else {
					formToSave.executionCount = 0; // Start with 0 executions
				}
			}

			// If hasExpiration is false, clear expiration fields (applies to all types if used)
			if (!hasExpiration) {
				formToSave.expirationDate = undefined;
				formToSave.expirationHour = undefined;
				formToSave.expirationMinute = undefined;
			}
	
			// Note: The `hasStartDate` checkbox primarily controls visibility for interval schedules.
			// For "one-time", startDate/Hour/Minute are directly part of its configuration.
			// For "cron", they are not used.
			// The logic above for each scheduleKind should correctly nullify them if not applicable.
	
			onSave(formToSave);
		}

		return (
			<div className="flex flex-col gap-5">
				<div className="flex flex-col gap-3">
					<h4 className="text-vscode-foreground text-lg font-medium m-0">
						{isEditing ? "Edit Schedule" : "Create New Schedule"}
					</h4>
					<LabeledInput
						label="Schedule Name"
						required
						className="w-full"
						placeholder="Enter schedule name..."
						value={form.name}
						onChange={(e) => setField("name", e.target.value)}
					/>
					<div className="flex flex-col gap-2">
						<label className="text-vscode-descriptionForeground text-sm">
							Project
							<span className="text-red-500 ml-0.5">*</span>
						</label>
						<Select
							value={form.projectId}
							onValueChange={(v) => setField("projectId", v)}
							disabled={!projects || projects.length === 0 || (isEditing && !!initialData?.projectId) /* Disable if editing and project already set */}
						>
							<SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
								<SelectValue placeholder={!projects || projects.length === 0 ? "No projects available" : "Select a project"} />
							</SelectTrigger>
							<SelectContent>
								{projects?.map((project) => (
									<SelectItem key={project.id} value={project.id}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{(!projects || projects.length === 0) && (
							<p className="text-xs text-vscode-errorForeground mt-1">
								Please create a project first in the Projects tab.
							</p>
						)}
					</div>
					<div className="flex flex-col gap-3 ">
						<div className="flex flex-col gap-2">
							<label className="text-vscode-descriptionForeground text-sm">
								Mode
								<span className="text-red-500 ml-0.5">*</span>
							</label>
							<Select value={form.mode} onValueChange={(v) => setField("mode", v)}>
								<SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
									<SelectValue placeholder="Select a mode" />
								</SelectTrigger>
								<SelectContent>
									{availableModes.map((mode) => (
										<SelectItem key={mode.slug} value={mode.slug}>
											{mode.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<label className="text-vscode-descriptionForeground text-sm">
								Prompt Source
							</label>
							<RadioGroup 
								value={promptSelectionType} 
								onValueChange={(value: 'custom' | 'saved') => {
									setPromptSelectionType(value);
									setField("promptSelectionType", value); // Update main form state
									if (value === 'custom') setField("savedPromptId", ""); // Clear savedPromptId if switching to custom
									else setField("taskInstructions", ""); // Clear custom instructions if switching to saved
								}} 
								className="flex space-x-2"
							>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="custom" id="promptCustom" />
									<label htmlFor="promptCustom" className="text-sm">Custom</label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="saved" id="promptSaved" />
									<label htmlFor="promptSaved" className="text-sm">Use Saved Prompt</label>
								</div>
							</RadioGroup>
						</div>

						{promptSelectionType === 'custom' && (
							<div className="flex flex-col gap-2">
								<label className="text-vscode-descriptionForeground text-sm">
									Custom Prompt
									<span className="text-red-500 ml-0.5">*</span>
								</label>
								<AutosizeTextarea
									className="w-full p-3 bg-vscode-input-background !bg-vscode-input-background border border-vscode-input-border"
									minHeight={100}
									maxHeight={300}
									placeholder="Enter task instructions..."
									value={form.taskInstructions}
									onChange={(e) => setField("taskInstructions", e.target.value)}
								/>
							</div>
						)}

						{promptSelectionType === 'saved' && (
							<div className="flex flex-col gap-2">
								<label className="text-vscode-descriptionForeground text-sm">
									Select Saved Prompt
									<span className="text-red-500 ml-0.5">*</span>
								</label>
								<Select 
									value={form.savedPromptId} 
									onValueChange={(v) => setField("savedPromptId", v)}
									disabled={!prompts || prompts.length === 0}
								>
									<SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
										<SelectValue placeholder={!prompts || prompts.length === 0 ? "No saved prompts available" : "Select a prompt"} />
									</SelectTrigger>
									<SelectContent>
										{prompts?.filter(p => !p.isArchived).map((prompt) => (
											<SelectItem key={prompt.id} value={prompt.id}>
												{prompt.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{(!prompts || prompts.length === 0) && (
									<p className="text-xs text-vscode-errorForeground mt-1">
										No saved prompts available. Create one in the Prompts tab.
									</p>
								)}
							</div>
						)}
					</div>
				</div>
				<div className="flex flex-col gap-3">
				<Tabs value={activeScheduleKindTab} onValueChange={(value) => setActiveScheduleKindTab(value as "one-time" | "interval" | "cron" | "recurring")} className="w-full">
						<TabsList className="grid w-full grid-cols-4 custom-tabs-list-transparent">
							<TabsTrigger value="one-time" className="custom-tab-trigger">
								<span className="codicon codicon-rocket mr-1"></span>
								One-time
							</TabsTrigger>
							<TabsTrigger value="recurring" className="custom-tab-trigger">
								<span className="codicon codicon-sync mr-1"></span>
								Recurring
							</TabsTrigger>
							<TabsTrigger value="interval" className="custom-tab-trigger">
								<span className="codicon codicon-clock mr-1"></span>
								Interval
							</TabsTrigger>
							<TabsTrigger value="cron" className="custom-tab-trigger">
								<span className="codicon codicon-gear mr-1"></span>
								Cron
							</TabsTrigger>
						</TabsList>
						<TabsContent value="one-time" className="mt-4">
							{/* Fields for one-time schedule will go here */}
							<p className="text-vscode-descriptionForeground">Configure one-time execution details.</p>
							<DateTimeSelector
								label="Execution Time"
								date={form.startDate} // Re-purpose startDate for one-time
								hour={form.startHour}   // Re-purpose startHour
								minute={form.startMinute} // Re-purpose startMinute
								setDate={(v) => setField("startDate", v)}
								setHour={(v) => setField("startHour", v)}
								setMinute={(v) => setField("startMinute", v)}
								dateAriaLabel="Execution date"
								hourAriaLabel="Execution hour"
								minuteAriaLabel="Execution minute"
							/>
						</TabsContent>
						<TabsContent value="interval" className="mt-4">
							{form.scheduleKind === "interval" && ( // Keep this check for conditional rendering within the tab
								<div className="flex flex-col gap-3">
									<div className="flex items-center gap-2">
										<label className="text-vscode-descriptionForeground text-sm">
									Every
									<span className="text-red-500 ml-0.5">*</span>
								</label>
								<Input
									type="number"
									min="1"
									className="w-16 h-7"
									value={form.timeInterval}
									onChange={(e) => {
										const value = parseInt(e.target.value)
										if (!isNaN(value) && value > 0) setField("timeInterval", value.toString())
										else if (e.target.value === "") setField("timeInterval", "")
									}}
									aria-label="Time interval"
								/>
								<Select value={form.timeUnit} onValueChange={(v) => setField("timeUnit", v)}>
									<SelectTrigger className="w-32 bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
										<SelectValue placeholder="Select unit" />
									</SelectTrigger>
									<SelectContent>
										{TIME_UNITS.map((u) => (
											<SelectItem key={u.value} value={u.value}>
												{u.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2 mt-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
								<Checkbox
									checked={hasDaysOfWeek}
									onChange={setHasDaysOfWeek}
									label="Runs on certain days of the week?"
									aria-label="Runs on certain days of the week"
									className="mb-0"
								/>

								{hasDaysOfWeek && (
									<>
										<div className="flex items-center gap-2 mt-2">
											<label className="text-vscode-descriptionForeground text-sm">
												Days of the week
											</label>
											{Object.values(form.selectedDays).filter(Boolean).length > 0 && (
												<Badge
													variant="outline"
													className="bg-vscode-badge-background text-vscode-badge-foreground">
													{Object.values(form.selectedDays).filter(Boolean).length}{" "}
													{Object.values(form.selectedDays).filter(Boolean).length === 1
														? "day"
														: "days"}{" "}
													selected
												</Badge>
											)}
										</div>
										<DaySelector selectedDays={form.selectedDays} toggleDay={toggleDay} />
									</>
								)}
							</div>
							<div className="flex flex-col gap-2 mt-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
								<Checkbox
									checked={hasStartDate}
									onChange={setHasStartDate}
									label="Has a specified start date?"
									aria-label="Has a specified start date"
									className="mb-0"
								/>

								{hasStartDate && (
									<DateTimeSelector
										label="Start Time"
										date={form.startDate}
										hour={form.startHour}
										minute={form.startMinute}
										setDate={(v) => setField("startDate", v)}
										setHour={(v) => setField("startHour", v)}
										setMinute={(v) => setField("startMinute", v)}
										dateAriaLabel="Start date"
										hourAriaLabel="Start hour"
										minuteAriaLabel="Start minute"
									/>
								)}
							</div>
							<div className="flex flex-col gap-2 mt-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
								<Checkbox
									checked={hasExpiration}
									onChange={(newHasExpiration) => {
										setHasExpiration(newHasExpiration)
										// If enabling expiration and we have a start date, ensure expiration date is set properly
										if (newHasExpiration && form.startDate) {
											// Create date objects for comparison
											let startDateTime = new Date(
												`${form.startDate}T${form.startHour}:${form.startMinute}:00`,
											)
											const currentTime = new Date()

											// Use the later of current time or start time
											const baseTime = startDateTime > currentTime ? startDateTime : currentTime

											// Set expiration to one hour after the base time
											const expirationTime = new Date(baseTime)
											expirationTime.setHours(expirationTime.getHours() + 1)

											// Format date in local time zone (YYYY-MM-DD)
											const year = expirationTime.getFullYear()
											const month = (expirationTime.getMonth() + 1).toString().padStart(2, "0")
											const day = expirationTime.getDate().toString().padStart(2, "0")
											const expirationDateFormatted = `${year}-${month}-${day}`

											// Format hour and minute
											const hour = expirationTime.getHours().toString().padStart(2, "0")
											const minute = expirationTime.getMinutes().toString().padStart(2, "0")

											setField("expirationDate", expirationDateFormatted)
											setField("expirationHour", hour)
											setField("expirationMinute", minute)
										}
									}}
									label="Has an expiration date?"
									aria-label="Has an expiration date"
									className="mb-0"
								/>

								{hasExpiration && (
									<DateTimeSelector
										label="Expires"
										date={form.expirationDate}
										hour={form.expirationHour}
										minute={form.expirationMinute}
										setDate={(v) => setField("expirationDate", v)}
										setHour={(v) => setField("expirationHour", v)}
										setMinute={(v) => setField("expirationMinute", v)}
										minDate={form.startDate}
										errorMessage={
											!validateExpirationTime()
												? "Expiration time must be after start time"
												: undefined
										}
										dateAriaLabel="Expiration date"
										hourAriaLabel="Expiration hour"
										minuteAriaLabel="Expiration minute"
									/>
								)}
							</div>
							<div className="flex flex-col gap-2 mt-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
								<Checkbox
									checked={form.requireActivity}
									onChange={() => setField("requireActivity", !form.requireActivity)}
									label="Only execute if I have task activity since the last execution of this schedule"
									aria-label="Only execute if I have task activity since the last execution of this schedule"
									className="mb-0"
								/>
							</div>
							<div className="flex flex-col gap-2 mt-2">
								<label className="text-vscode-descriptionForeground text-sm">
									When a task is already running
								</label>
								<Select
									value={form.taskInteraction}
									onValueChange={(v: "wait" | "interrupt" | "skip") =>
										setField("taskInteraction", v)
									}>
									<SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
										<SelectValue placeholder="Select behavior" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="wait">Run after specified inactivity</SelectItem>
										<SelectItem value="interrupt">Interrupt current task</SelectItem>
										<SelectItem value="skip">Skip this execution</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{form.taskInteraction === "wait" && (
								<div className="flex flex-col gap-2 mt-2">
									<label className="text-vscode-descriptionForeground text-sm">
										Inactivity delay (minutes)
										<span className="text-red-500 ml-0.5">*</span>
									</label>
									<Input
										type="number"
										min="1"
										className="w-full"
										value={form.inactivityDelay}
										onChange={(e) => {
											const value = parseInt(e.target.value)
											if (!isNaN(value) && value > 0)
												setField("inactivityDelay", value.toString())
											else if (e.target.value === "") setField("inactivityDelay", "")
										}}
										aria-label="Inactivity delay in minutes"
									/>
								</div>
							)}
								</div>
							)}
						</TabsContent>
						<TabsContent value="cron" className="mt-4">
							{/* Fields for cron schedule will go here */}
							<p className="text-vscode-descriptionForeground">Configure cron expression.</p>
							<LabeledInput
								label="Cron Expression"
								required={form.scheduleKind === "cron"}
								className="w-full"
								placeholder="* * * * *"
								value={form.cronExpression}
								onChange={(e) => setField("cronExpression", e.target.value)}
							/>
						</TabsContent>
						<TabsContent value="recurring" className="mt-4">
							{form.scheduleKind === "recurring" && (
								<div className="flex flex-col gap-4">
									<p className="text-vscode-descriptionForeground">Configure recurring schedule details.</p>
									
									<div className="flex flex-col gap-2">
										<label className="text-vscode-descriptionForeground text-sm">
											Recurrence Type
											<span className="text-red-500 ml-0.5">*</span>
										</label>
										<Select 
											value={form.recurrenceType} 
											onValueChange={(v: "daily" | "weekly" | "monthly" | "yearly") => setField("recurrenceType", v)}
										>
											<SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
												<SelectValue placeholder="Select recurrence type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="daily">Daily</SelectItem>
												<SelectItem value="weekly">Weekly</SelectItem>
												<SelectItem value="monthly">Monthly</SelectItem>
												<SelectItem value="yearly">Yearly</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{form.recurrenceType === "weekly" && (
										<div className="flex flex-col gap-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
											<label className="text-vscode-descriptionForeground text-sm">
												Day of the Week
											</label>
											<DaySelector selectedDays={form.selectedDays} toggleDay={toggleDay} />
										</div>
									)}

									{(form.recurrenceType === "monthly" || form.recurrenceType === "yearly") && (
										<div className="flex flex-col gap-2">
											<label className="text-vscode-descriptionForeground text-sm">
												Day of Month
												<span className="text-red-500 ml-0.5">*</span>
											</label>
											<Input
												type="number"
												min="1"
												max="31"
												className="w-full"
												value={form.recurrenceDay}
												onChange={(e) => {
													const value = parseInt(e.target.value)
													if (!isNaN(value) && value >= 1 && value <= 31) {
														setField("recurrenceDay", value)
													}
												}}
												aria-label="Day of month"
											/>
										</div>
									)}

									{form.recurrenceType === "yearly" && (
										<div className="flex flex-col gap-2">
											<label className="text-vscode-descriptionForeground text-sm">
												Month
												<span className="text-red-500 ml-0.5">*</span>
											</label>
											<Select 
												value={form.recurrenceMonth.toString()} 
												onValueChange={(v) => setField("recurrenceMonth", parseInt(v))}
											>
												<SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
													<SelectValue placeholder="Select month" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="1">January</SelectItem>
													<SelectItem value="2">February</SelectItem>
													<SelectItem value="3">March</SelectItem>
													<SelectItem value="4">April</SelectItem>
													<SelectItem value="5">May</SelectItem>
													<SelectItem value="6">June</SelectItem>
													<SelectItem value="7">July</SelectItem>
													<SelectItem value="8">August</SelectItem>
													<SelectItem value="9">September</SelectItem>
													<SelectItem value="10">October</SelectItem>
													<SelectItem value="11">November</SelectItem>
													<SelectItem value="12">December</SelectItem>
												</SelectContent>
											</Select>
										</div>
									)}

									<div className="flex flex-col gap-2">
										<label className="text-vscode-descriptionForeground text-sm">
											Time of Day
											<span className="text-red-500 ml-0.5">*</span>
										</label>
										<div className="flex items-center gap-2">
											<Input
												type="number"
												min="0"
												max="23"
												className="w-20"
												value={form.startHour}
												onChange={(e) => {
													const value = parseInt(e.target.value)
													if (!isNaN(value) && value >= 0 && value <= 23) {
														setField("startHour", value.toString().padStart(2, "0"))
													}
												}}
												aria-label="Hour"
											/>
											<span>:</span>
											<Input
												type="number"
												min="0"
												max="59"
												className="w-20"
												value={form.startMinute}
												onChange={(e) => {
													const value = parseInt(e.target.value)
													if (!isNaN(value) && value >= 0 && value <= 59) {
														setField("startMinute", value.toString().padStart(2, "0"))
													}
												}}
												aria-label="Minute"
											/>
										</div>
									</div>

									<div className="flex flex-col gap-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
										<div className="flex items-center gap-2">
											<Checkbox
												checked={form.maxExecutions > 0}
												onChange={(checked) => {
													setField("maxExecutions", checked ? 1 : 0)
												}}
												label="Limit number of executions"
												aria-label="Limit number of executions"
												className="mb-0"
											/>
										</div>

										{form.maxExecutions > 0 && (
											<div className="flex flex-col gap-2 mt-2">
												<label className="text-vscode-descriptionForeground text-sm">
													Maximum executions
													<span className="text-red-500 ml-0.5">*</span>
												</label>
												<Input
													type="number"
													min="1"
													className="w-full"
													value={form.maxExecutions}
													onChange={(e) => {
														const value = parseInt(e.target.value)
														if (!isNaN(value) && value > 0) {
															setField("maxExecutions", value)
														}
													}}
													aria-label="Maximum executions"
												/>
											</div>
										)}
									</div>

									<div className="flex flex-col gap-2 p-3 bg-vscode-editor-background border border-vscode-panel-border rounded">
										<Checkbox
											checked={hasExpiration}
											onChange={(newHasExpiration) => {
												setHasExpiration(newHasExpiration)
												// If enabling expiration, set a future date
												if (newHasExpiration) {
													const expirationTime = new Date()
													expirationTime.setMonth(expirationTime.getMonth() + 1)

													// Format date in local time zone (YYYY-MM-DD)
													const year = expirationTime.getFullYear()
													const month = (expirationTime.getMonth() + 1).toString().padStart(2, "0")
													const day = expirationTime.getDate().toString().padStart(2, "0")
													const expirationDateFormatted = `${year}-${month}-${day}`

													// Format hour and minute
													const hour = expirationTime.getHours().toString().padStart(2, "0")
													const minute = expirationTime.getMinutes().toString().padStart(2, "0")

													setField("expirationDate", expirationDateFormatted)
													setField("expirationHour", hour)
													setField("expirationMinute", minute)
												}
											}}
											label="Has an expiration date?"
											aria-label="Has an expiration date"
											className="mb-0"
										/>

										{hasExpiration && (
											<DateTimeSelector
												label="Expires"
												date={form.expirationDate}
												hour={form.expirationHour}
												minute={form.expirationMinute}
												setDate={(v) => setField("expirationDate", v)}
												setHour={(v) => setField("expirationHour", v)}
												setMinute={(v) => setField("expirationMinute", v)}
												dateAriaLabel="Expiration date"
												hourAriaLabel="Expiration hour"
												minuteAriaLabel="Expiration minute"
											/>
										)}
									</div>
								</div>
							)}
						</TabsContent>
					</Tabs>
				</div>
				{/* Buttons removed from here, handled by SchedulerView.tsx */}
			</div>
		)
	},
)

export default ScheduleForm
