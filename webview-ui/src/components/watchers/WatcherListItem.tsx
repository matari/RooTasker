import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Watcher } from "./types";
import { Badge } from "@/components/ui/badge";
import ProjectColorDot from "../projects/ProjectColorDot";
import type { Prompt } from "../../../../src/shared/ProjectTypes"; // Import Prompt type

type WatcherListItemProps = {
  watcher: Watcher;
  projectName?: string;
  projectColor?: string;
  prompts: Prompt[]; // Add prompts to props
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean | undefined) => void;
  onDuplicate: (id: string) => void; // Added duplicate functionality
  onResumeTask: (taskId: string) => void; // If we want to resume last task
  formatDate: (dateString: string) => string; // Re-use from scheduler or a common util
};

const WatcherListItem: React.FC<WatcherListItemProps> = ({
  watcher,
  projectName, // Added
  projectColor, // Added
  prompts, // Destructure prompts
  onEdit,
  onDelete,
  onToggleActive,
  onDuplicate, // Added
  onResumeTask,
  formatDate,
}) => {
  const [isHoveringToggle, setIsHoveringToggle] = useState(false); // Added hover state

  return (
    <div
      data-testid={`watcher-item-${watcher.id}`}
      className="cursor-pointer border border-vscode-panel-border rounded-md mb-3 shadow-sm hover:shadow-md transition-shadow duration-150 bg-vscode-sideBar-background"
      onClick={() => onEdit(watcher.id)}
    >
      <div className="flex items-start p-4 gap-3"> {/* Increased padding and gap */}
        <div className="flex-1 min-w-0">
        	<div className="flex justify-between items-center mb-1">
        		<div className="flex items-center min-w-0 flex-grow"> {/* Allow this section to grow and truncate */}
        			{/* ProjectColorDot and projectName removed from here */}
        			<span className="codicon codicon-eye mr-1.5 flex-shrink-0" title="Watcher"></span> {/* Removed text-vscode-descriptionForeground */}
        			<span className="text-vscode-foreground font-medium text-base truncate" title={watcher.name}>{watcher.name}</span>
        		</div>
        		<div className="flex flex-row gap-1 items-center flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 p-0 rounded ${
                  watcher.active !== false // Watcher is Active
                    ? isHoveringToggle
                      ? "text-vscode-descriptionForeground" // Grey Pause on hover
                      : "text-green-600" // Green Play
                    : "text-vscode-errorForeground" // Red Pause when inactive
                }`}
                onClick={e => {
                  e.stopPropagation();
                  // The prop onToggleActive expects the *current* active state.
                  // The handler in WatchersView then calculates the new state.
                  onToggleActive(watcher.id, watcher.active); 
                }}
                onMouseEnter={() => setIsHoveringToggle(true)}
                onMouseLeave={() => setIsHoveringToggle(false)}
                aria-label={
                  watcher.active !== false
                    ? "Deactivate watcher (Pause)"
                    : "Activate watcher (Play)"
                }
                title={
                  watcher.active !== false
                    ? isHoveringToggle ? "Pause" : "Active (Play)"
                    : "Activate (was Paused)"
                }
              >
                <span
                  className={`codicon ${
                    watcher.active !== false // Watcher is Active
                      ? isHoveringToggle
                        ? 'codicon-debug-pause' // Show Pause on hover
                        : 'codicon-debug-start' // Show Play
                      : 'codicon-debug-pause' // Watcher is Inactive - Show Red Pause Icon
                  }`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                title="Edit watcher"
                onClick={e => { e.stopPropagation(); onEdit(watcher.id); }}
                aria-label="Edit watcher"
              >
                <span className="codicon codicon-edit" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                title="Duplicate watcher"
                onClick={e => { e.stopPropagation(); onDuplicate(watcher.id); }}
                aria-label="Duplicate watcher"
              >
                <span className="codicon codicon-copy" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                title="Delete watcher"
                onClick={e => { e.stopPropagation(); onDelete(watcher.id); }}
                aria-label="Delete watcher"
              >
                <span className="codicon codicon-trash text-vscode-errorForeground" />
              </Button>
            </div>
          </div>

          <div className="text-xs text-vscode-descriptionForeground truncate" title={watcher.directoryPath}>
            <span className="codicon codicon-folder mr-1"></span>
            {watcher.directoryPath}
          </div>

          <div className="mt-1 text-xs text-vscode-descriptionForeground">
            <span className="codicon codicon-file-code mr-1"></span>
            File Types: {watcher.fileTypes.map(ft => <Badge variant="outline" key={ft} className="mr-1 text-xs px-1 py-0">{ft}</Badge>)}
          </div>
          
          <div className="mt-1 text-xs text-vscode-descriptionForeground">
            <span className="codicon codicon-zap mr-1"></span>
            Mode: <span className="font-medium">{watcher.modeDisplayName || watcher.mode}</span>
          </div>

          <div
            className="text-xs text-vscode-descriptionForeground mt-1 italic truncate"
            title={
              watcher.promptSelectionType === 'saved' && watcher.savedPromptId
                ? prompts.find(p => p.id === watcher.savedPromptId)?.title || 'Saved Prompt (not found)'
                : watcher.prompt
            }
            style={{
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
            }}
          >
            Prompt: {watcher.promptSelectionType === 'saved' && watcher.savedPromptId
              ? (prompts.find(p => p.id === watcher.savedPromptId)?.title || `Saved ID: ${watcher.savedPromptId.substring(0,8)}...`)
              : watcher.prompt || "Not set"
            }
          </div>

          {watcher.lastTriggeredTime && (
            <div className="mt-2 text-xs text-vscode-descriptionForeground flex items-center">
              <span className="codicon codicon-clock mr-1"></span>
              Last triggered:{" "}
              {watcher.lastTaskId ? (
                <button
                  className="inline-flex items-center px-1 py-0.5 rounded hover:bg-vscode-button-hoverBackground text-vscode-linkForeground hover:underline cursor-pointer"
                  onClick={e => {
                    e.stopPropagation();
                    onResumeTask(watcher.lastTaskId!);
                  }}
                  title="Click to view/resume this task in Roo Code"
                >
                  {formatDate(watcher.lastTriggeredTime)}
                </button>
              ) : (
                formatDate(watcher.lastTriggeredTime)
               )}
              </div>
             )}
        
             {/* Project Info - Bottom Left */}
             <div className="flex items-center mt-3 pt-3 border-t border-vscode-panel-border"> {/* Added top border and margin */}
              {projectColor && <ProjectColorDot color={projectColor} size="sm" />}
              {projectName && (
               <span className="text-vscode-descriptionForeground text-xs ml-1 truncate" title={projectName}> {/* Smaller text, added margin */}
                {projectName}
               </span>
              )}
             </div>
            </div>
           </div>
          </div>
         );
};

export default WatcherListItem;
