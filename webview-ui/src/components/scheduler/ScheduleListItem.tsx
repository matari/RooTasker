import React, { useState } from "react"; // Added useState
import { Button } from "../../components/ui/button";
import { Schedule } from "./types";

import ProjectColorDot from "../projects/ProjectColorDot"; // Import ProjectColorDot

type ScheduleListItemProps = {
  schedule: Schedule;
  projectName?: string; // Added project name
  projectColor?: string; // Added project color
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onRunNow: (id: string) => void; // Added for Run Now
  onDuplicate: (id: string) => void; // Added for duplicating schedules
  onResumeTask: (taskId: string) => void;
  formatDate: (dateString: string) => string;
};

const ScheduleListItem: React.FC<ScheduleListItemProps> = ({
  schedule,
  projectName, // Added
  projectColor, // Added
  onEdit,
  onDelete,
  onToggleActive,
  onRunNow,
  onDuplicate, // Added
  onResumeTask,
  formatDate,
}) => {
  const [isHoveringToggle, setIsHoveringToggle] = useState(false); // Added hover state

  const expirationDateTime = new Date(
    `${schedule.expirationDate}T${schedule.expirationHour || "23"}:${schedule.expirationMinute || "59"}:00`
  );
  const nextExecutionDateTime = schedule.nextExecutionTime
    ? new Date(schedule.nextExecutionTime)
    : null;

  const getScheduleIcon = (sch: Schedule): string => {
    switch (sch.scheduleKind) {
      case "one-time":
        return "codicon-rocket";
      case "recurring":
        switch (sch.recurrenceType) {
          case "daily":
            return "codicon-calendar";
          case "weekly":
            return "codicon-list-ordered";
          case "monthly":
            return "codicon-calendar";
          case "yearly":
            return "codicon-globe";
          default:
            return "codicon-sync"; // Changed to match the tab icon
        }
      case "interval":
        switch (sch.timeUnit) {
          case "minute":
          case "hour":
            return "codicon-clock";
          case "day":
            return "codicon-calendar"; // User suggestion for daily
          case "week":
            return "codicon-list-ordered"; // User suggestion for weekly
          case "month":
            return "codicon-calendar"; // User suggestion for monthly
          default:
            return "codicon-history"; // Fallback for interval
        }
      case "cron":
        return "codicon-gear";
      default:
        return "codicon-circle-small-filled"; // Default unknown
    }
  };

  return (
    <div
      data-testid={`schedule-item-${schedule.id}`}
      className="cursor-pointer border border-vscode-panel-border rounded-md mb-3 shadow-sm hover:shadow-md transition-shadow duration-150 bg-vscode-sideBar-background"
      onClick={() => onEdit(schedule.id)}
    >
      <div className="flex items-start p-4 gap-3"> {/* Increased padding and gap */}
        <div className="flex-1 min-w-0"> {/* Added min-w-0 for better truncation inside flex */}
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center min-w-0 flex-grow"> {/* Allow this section to grow and truncate */}
              {projectColor && <ProjectColorDot color={projectColor} size="sm" />}
              {projectName && (
                <span className="text-vscode-descriptionForeground text-sm mr-1 truncate" title={projectName}>
                  {projectName}:
                </span>
              )}
              <span className={`codicon ${getScheduleIcon(schedule)} mr-1.5 text-vscode-descriptionForeground flex-shrink-0`} title={`Type: ${schedule.scheduleKind}`}></span>
              <span className="text-vscode-foreground font-medium text-base truncate" title={schedule.name}>{schedule.name}</span>
            </div>
            <div className="flex flex-row gap-1 items-center flex-shrink-0">
              {/* Active/Inactive Status Indicator (Play/Pause Icons) */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 p-0 rounded ${
                  schedule.active !== false // Task is Active
                    ? isHoveringToggle
                      ? "text-vscode-descriptionForeground" // Grey Pause on hover when active
                      : "text-green-600" // Green Play when active
                    : "text-vscode-errorForeground" // Red Pause when inactive
                }`}
                onClick={e => {
                  e.stopPropagation();
                  onToggleActive(schedule.id, !(schedule.active !== false));
                }}
                onMouseEnter={() => setIsHoveringToggle(true)}
                onMouseLeave={() => setIsHoveringToggle(false)}
                aria-label={
                  schedule.active !== false
                    ? "Deactivate schedule (Pause)"
                    : "Activate schedule (Play)"
                }
                title={
                  schedule.active !== false
                    ? isHoveringToggle ? "Pause" : "Active (Play)"
                    : "Activate (was Paused)"
                }
              >
                <span
                  className={`codicon ${
                    schedule.active !== false // Task is Active
                      ? isHoveringToggle
                        ? 'codicon-debug-pause' // Show Pause on hover
                        : 'codicon-debug-start' // Show Play
                      : 'codicon-debug-pause' // Task is Inactive - Show Red Pause Icon (clicking will activate/play)
                  }`}
                />
              </Button>

              {/* Edit Button */}
              <Button
                variant="ghost"
                size="icon" // Use "icon" size
                className="h-7 w-7 p-0"
                title="Edit schedule"
                data-testid="edit-schedule-button"
                onClick={e => {
                  e.stopPropagation();
                  onEdit(schedule.id);
                }}
                aria-label="Edit schedule"
              >
                <span className="codicon codicon-edit" />
              </Button>

              {/* Duplicate Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                title="Duplicate schedule"
                data-testid="duplicate-schedule-button"
                onClick={e => {
                  e.stopPropagation();
                  onDuplicate(schedule.id);
                }}
                aria-label="Duplicate schedule"
              >
                <span className="codicon codicon-copy" />
              </Button>

              {/* Delete Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                title="Delete schedule"
                data-testid="delete-schedule-button"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(schedule.id);
                }}
                aria-label="Delete schedule"
              >
                <span className="codicon codicon-trash text-vscode-errorForeground" />
              </Button>
            </div>
          </div>

          <div
            className="text-sm text-vscode-descriptionForeground mt-2"
            style={{
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span className="font-bold">{schedule.modeDisplayName || schedule.mode}: </span>
            <span className="italic">{schedule.taskInstructions}</span>
          </div>

          {schedule.scheduleKind === "interval" && schedule.timeInterval && schedule.timeUnit && (
            <div className="mt-2 text-xs text-vscode-descriptionForeground">
              Every {schedule.timeInterval} {schedule.timeUnit}(s)
              {Object.values(schedule.selectedDays || {}).filter(Boolean).length > 0 &&
                Object.values(schedule.selectedDays || {}).filter(Boolean).length < 7 && (
                <span>
                  {" "}
                  • {Object.values(schedule.selectedDays || {}).filter(Boolean).length} days selected
                </span>
              )}
              {schedule.requireActivity && (
                <span> • Only after activity</span>
              )}
              <span> • {
                schedule.taskInteraction === "interrupt" ? "Pre-empt existing tasks" :
                schedule.taskInteraction === "wait" ? "Wait for inactivity" :
                schedule.taskInteraction === "skip" ? "Skip if a task is active" :
                "Waits for inactivity" // Default behavior if taskInteraction is not defined
              }</span>
            </div>
          )}
          {schedule.scheduleKind === "cron" && schedule.cronExpression && (
            <div className="mt-2 text-xs text-vscode-descriptionForeground">
              Cron: <span className="font-mono">{schedule.cronExpression}</span>
              <span> • {
                schedule.taskInteraction === "interrupt" ? "Pre-empt existing tasks" :
                schedule.taskInteraction === "wait" ? "Wait for inactivity" :
                schedule.taskInteraction === "skip" ? "Skip if a task is active" :
                "Waits for inactivity"
              }</span>
            </div>
          )}
          {schedule.scheduleKind === "one-time" && schedule.startDate && schedule.startHour && schedule.startMinute && (
             <div className="mt-2 text-xs text-vscode-descriptionForeground">
              One-time on: {formatDate(`${schedule.startDate}T${schedule.startHour}:${schedule.startMinute}:00`)}
               <span> • {
                schedule.taskInteraction === "interrupt" ? "Pre-empt existing tasks" :
                schedule.taskInteraction === "wait" ? "Wait for inactivity" :
                schedule.taskInteraction === "skip" ? "Skip if a task is active" :
                "Waits for inactivity"
              }</span>
            </div>
          )}

          {/* Last Execution Time */}
          {schedule.lastExecutionTime && (
            <div className="mt-2 text-xs text-vscode-descriptionForeground flex items-center">
              <span className="codicon codicon-clock mr-1"></span>
              Last executed:{" "}
              {schedule.lastTaskId ? (
                <button
                  className="inline-flex items-center px-1 py-0.5 rounded hover:bg-vscode-button-hoverBackground text-vscode-linkForeground hover:underline cursor-pointer"
                  onClick={e => {
                    e.stopPropagation();
                    onResumeTask(schedule.lastTaskId!);
                  }}
                  title="Click to view/resume this task in Roo Code"
                >
                  {formatDate(schedule.lastExecutionTime)}
                </button>
              ) : (
                formatDate(schedule.lastExecutionTime)
              )}
            </div>
          )}

          {/* Last Skipped Time */}
          {schedule.lastSkippedTime &&
            (!schedule.lastExecutionTime ||
              new Date(schedule.lastSkippedTime) >= new Date(schedule.lastExecutionTime)) && (
              <div className="mt-1 text-xs text-vscode-descriptionForeground flex items-center">
                <span className="codicon codicon-debug-step-back mr-1"></span>
                Last skipped: {formatDate(schedule.lastSkippedTime)}
              </div>
            )}

          {schedule.active !== false &&
            (schedule.scheduleKind === "interval" || schedule.scheduleKind === "cron") && // Show next execution for interval and cron
            !(expirationDateTime && nextExecutionDateTime && expirationDateTime < nextExecutionDateTime) && (
              <div className="mt-1 text-xs text-vscode-descriptionForeground flex items-center">
                <span className="codicon codicon-calendar mr-1"></span>
                Next execution: &nbsp;
                {nextExecutionDateTime ? (
                  <span className="text-vscode-linkForeground">
                    {formatDate(nextExecutionDateTime.toISOString())}
                  </span>
                ) : (
                  <span className="italic">Not scheduled</span>
                )}
              </div>
            )}

          {/* Expiration information */}
          {schedule.expirationDate && (
            <div className="mt-1 text-xs text-vscode-descriptionForeground flex items-center">
              <span className="codicon codicon-error mr-1"></span>
              {(() => {
                const now = new Date();
                const isExpired = now > expirationDateTime;
                return (
                  <>
                    <span>{isExpired ? "Expired: " : "Expires: "}</span>
                    <span className={isExpired ? "text-vscode-errorForeground ml-1" : "text-vscode-descriptionForeground ml-1"}>
                      {formatDate(expirationDateTime.toISOString())}
                    </span>
                  </>
                );
              })()}
            </div>
          )}

          {/* "Run Now" Button - Moved to bottom right */}
          <div className="flex justify-end mt-3">
            <Button
              variant="outline" // Changed variant for better visibility at bottom
              size="sm" // Slightly larger for a standalone action
              className="h-8 px-3 py-1" // Adjusted padding
              title="Run now"
              data-testid="run-now-schedule-button-bottom"
              onClick={e => {
                e.stopPropagation(); // Prevent card click
                onRunNow(schedule.id);
              }}
              aria-label="Run schedule now"
            >
              <span className="codicon codicon-play mr-1"></span> {/* Added margin to icon */}
              Run Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleListItem;
