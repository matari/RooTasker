import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { Button, RadioGroup, RadioGroupItem } from "@/components/ui"; // Added RadioGroup
import { useExtensionState } from "../../context/ExtensionStateContext";
import { Input } from "@/components/ui/input";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge"; // Added Badge
import LabeledInput from "../scheduler/LabeledInput"; // Re-use LabeledInput
import Checkbox from "@/components/ui/checkbox"; 
import { ModeConfig } from "../../../../src/shared/modes";
import { Prompt } from "../../../../src/shared/ProjectTypes"; // Added Prompt import
import { Watcher } from "./types"; // This should now include promptSelectionType and savedPromptId from BaseWatcher
import { vscode } from "../../utils/vscode";

export type WatcherFormData = Omit<Watcher, "id" | "createdAt" | "updatedAt" | "modeDisplayName" | "lastTriggeredTime" | "lastTaskId">;

type RequiredWatcherFormData = {
  [K in keyof WatcherFormData]-?: NonNullable<WatcherFormData[K]>;
};

interface WatcherFormProps {
  initialData?: Partial<WatcherFormData>;
  isEditing: boolean;
  availableModes: ModeConfig[];
  onSave: (formData: WatcherFormData) => void;
  onCancel: () => void;
  onValidityChange?: (isValid: boolean) => void;
}

export interface WatcherFormHandle {
  submitForm: () => void;
}

const getDefinedForm = (initialData?: Partial<WatcherFormData>): RequiredWatcherFormData => ({
  projectId: initialData?.projectId ?? "", // Added projectId
  name: initialData?.name ?? "",
  directoryPath: initialData?.directoryPath ?? "",
  fileTypes: initialData?.fileTypes ?? ["*.*"], 
  prompt: initialData?.prompt ?? "",
  promptSelectionType: initialData?.promptSelectionType ?? "custom",
  savedPromptId: initialData?.savedPromptId ?? "",
  mode: initialData?.mode ?? "code", 
  active: initialData?.active ?? true,
});

const WatcherForm = forwardRef<WatcherFormHandle, WatcherFormProps>(
  ({ initialData, isEditing, availableModes, onSave, onCancel, onValidityChange }, ref) => {
  	const { projects, activeProjectId, prompts } = useExtensionState(); // Added prompts
  	const [currentFileTypeTagInput, setCurrentFileTypeTagInput] = useState<string>("");
  	const [promptSelectionType, setPromptSelectionType] = useState<'custom' | 'saved'>(
		initialData?.promptSelectionType || 'custom'
	);
 
  	const effectiveInitialData = useMemo(() => {
  		let data = initialData;
  		if (!isEditing && (!data || !data.projectId)) {
  			data = { ...data, projectId: activeProjectId || "" };
  		}
  		return data;
  	}, [initialData, isEditing, activeProjectId]);
 
  	const [form, setForm] = useState<RequiredWatcherFormData>(getDefinedForm(effectiveInitialData));
  	
  	useEffect(() => {
  		// Re-initialize form when initialData or activeProjectId (for new forms) changes
  		let baseData = initialData;
  		if (!isEditing && (!baseData || !baseData.projectId) && activeProjectId) {
  			baseData = { ...baseData, projectId: activeProjectId };
  		}
  		setForm(getDefinedForm(baseData));
  	}, [initialData, isEditing, activeProjectId]);
 
 
  	const isValid = useMemo(() => {
  		return (
  			!!form.name.trim() &&
  			!!form.projectId && 
  			!!form.directoryPath.trim() &&
  			form.fileTypes.length > 0 &&
  			(form.promptSelectionType === 'custom' ? !!form.prompt.trim() : !!form.savedPromptId) &&
  			!!form.mode
  		);
  	}, [form]);
 
  	useEffect(() => {
  		if (onValidityChange) onValidityChange(isValid);
  	}, [isValid, onValidityChange]);


    useImperativeHandle(ref, () => ({
      submitForm: () => handleSave(),
    }));

    const setField = <K extends keyof RequiredWatcherFormData>(key: K, value: RequiredWatcherFormData[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    };

    const handleAddFileType = () => {
      const newFileType = currentFileTypeTagInput.trim();
      if (newFileType && !form.fileTypes.includes(newFileType)) {
        setField("fileTypes", [...form.fileTypes, newFileType]);
      }
      setCurrentFileTypeTagInput(""); // Clear input
    };

    const handleRemoveFileType = (typeToRemove: string) => {
      setField("fileTypes", form.fileTypes.filter(ft => ft !== typeToRemove));
    };
    
    const handleFileTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        handleAddFileType();
      }
    };
    
    const handleBrowseDirectory = () => {
        vscode.postMessage({ type: "selectDirectoryForWatcher" }); 
        // Need to listen for 'directorySelectedForWatcher' message from extension
        // and then update form.directoryPath
    };
    
    // Effect to listen for directory selection response
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === "directorySelectedForWatcher" && message.path) {
                setField("directoryPath", message.path);
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    useEffect(() => {
      // Update main form state when local promptSelectionType changes
      setField("promptSelectionType", promptSelectionType);
    }, [promptSelectionType]);

    const handleSave = () => {
      if (!isValid) {
        console.error("Form is invalid");
        return;
      }
      // form.fileTypes is already an array of strings
      if (form.fileTypes.length === 0) {
          console.error("File types cannot be empty");
          return;
      }
      onSave(form); // Pass form directly as it's already updated
    };

    return (
      <div className="flex flex-col gap-5 p-1">
        <h4 className="text-vscode-foreground text-lg font-medium m-0">
          {isEditing ? "Edit Watcher" : "Create New Watcher"}
        </h4>
        <LabeledInput
          label="Watcher Name"
          required
          className="w-full"
          placeholder="Enter watcher name..."
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
         />
         <div className="flex flex-col gap-1">
          <label className="text-vscode-descriptionForeground text-sm">
          	Project
          	<span className="text-red-500 ml-0.5">*</span>
          </label>
          <Select
          	value={form.projectId}
          	onValueChange={(v) => setField("projectId", v)}
          	disabled={!projects || projects.length === 0 || (isEditing && !!initialData?.projectId)}
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
         <div className="flex flex-col gap-1">
          <label className="text-vscode-descriptionForeground text-sm">
                Directory Path <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
                <Input
                    className="w-full"
                    placeholder="Enter or browse directory path..."
                    value={form.directoryPath}
                    onChange={(e) => setField("directoryPath", e.target.value)}
                />
                <Button variant="outline" onClick={handleBrowseDirectory} className="h-9 px-3">
                    Browse
                </Button>
            </div>
        </div>
        
        <div className="flex flex-col gap-1">
            <label className="text-vscode-descriptionForeground text-sm">
                File Types / Patterns <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-2 p-2 border border-vscode-input-border rounded-md min-h-[40px]">
                {form.fileTypes.map((fileType) => (
                    <Badge key={fileType} variant="secondary" className="flex items-center gap-1">
                        {fileType}
                        <button
                            type="button"
                            className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            onClick={() => handleRemoveFileType(fileType)}
                            aria-label={`Remove ${fileType}`}
                        >
                           <span className="codicon codicon-close text-xs"></span>
                        </button>
                    </Badge>
                ))}
            </div>
            <Input
                type="text"
                placeholder="Add a file type (e.g., *.ts, data.txt) and press Enter or Comma"
                value={currentFileTypeTagInput}
                onChange={(e) => setCurrentFileTypeTagInput(e.target.value)}
                onKeyDown={handleFileTypeKeyDown}
                onBlur={handleAddFileType} // Add on blur as well
                className="w-full"
            />
            <p className="text-xs text-vscode-descriptionForeground mt-1">Enter a glob pattern or file extension. Press Enter or Comma to add.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-vscode-descriptionForeground text-sm">
            Mode <span className="text-red-500 ml-0.5">*</span>
          </label>
          <Select value={form.mode} onValueChange={(v) => setField("mode", v)}>
            <SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
              <SelectValue placeholder="Select a mode" />
            </SelectTrigger>
            <SelectContent>
              {availableModes.map((modeConfig) => (
                <SelectItem key={modeConfig.slug} value={modeConfig.slug}>
                  {modeConfig.name}
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
              if (value === 'custom') setField("savedPromptId", "");
              else setField("prompt", ""); 
            }} 
            className="flex space-x-2"
          >
            <div className="flex items-center space-x-1">
              <RadioGroupItem value="custom" id="watcherPromptCustom" />
              <label htmlFor="watcherPromptCustom" className="text-sm">Custom</label>
            </div>
            <div className="flex items-center space-x-1">
              <RadioGroupItem value="saved" id="watcherPromptSaved" />
              <label htmlFor="watcherPromptSaved" className="text-sm">Use Saved Prompt</label>
            </div>
          </RadioGroup>
        </div>

        {promptSelectionType === 'custom' && (
          <div className="flex flex-col gap-1">
            <label className="text-vscode-descriptionForeground text-sm">
              Custom Prompt <span className="text-red-500 ml-0.5">*</span>
            </label>
            <AutosizeTextarea
              className="w-full p-3 bg-vscode-input-background !bg-vscode-input-background border border-vscode-input-border"
              minHeight={80}
              maxHeight={250}
              placeholder="Enter prompt to run when files change..."
              value={form.prompt}
              onChange={(e) => setField("prompt", e.target.value)}
            />
          </div>
        )}

        {promptSelectionType === 'saved' && (
          <div className="flex flex-col gap-1">
            <label className="text-vscode-descriptionForeground text-sm">
              Select Saved Prompt <span className="text-red-500 ml-0.5">*</span>
            </label>
            <Select 
              value={form.savedPromptId} 
              onValueChange={(v) => setField("savedPromptId", v)}
              disabled={!prompts || prompts.length === 0}
            >
              <SelectTrigger className="w-full bg-vscode-dropdown-background !bg-vscode-dropdown-background hover:!bg-vscode-dropdown-background border border-vscode-dropdown-border">
                <SelectValue placeholder={!prompts || prompts.length === 0 ? "No saved prompts" : "Select a prompt"} />
              </SelectTrigger>
              <SelectContent>
                {prompts?.filter(p => !p.isArchived).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
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
        
        <div className="flex items-center space-x-2 mt-2">
            <Checkbox
                id="watcher-active"
                checked={form.active}
                onChange={(newActiveState: boolean) => setField("active", newActiveState)}
            />
            <label
                htmlFor="watcher-active"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-vscode-descriptionForeground"
            >
                Active
            </label>
        </div>

        {/* Buttons removed from here, handled by WatchersView.tsx */}
      </div>
    );
  }
);

export default WatcherForm;
