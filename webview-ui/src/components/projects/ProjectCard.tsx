import React, { useState } from 'react';
import type { Project } from '../../../../src/shared/ProjectTypes';
import type { Schedule } from '../scheduler/types';
import type { Watcher } from '../watchers/types';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils'; // For conditional class names
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react'; // For expand/collapse icon
import ScheduleMiniCard from './ScheduleMiniCard';
import WatcherMiniCard from './WatcherMiniCard';
import ProjectColorDot from './ProjectColorDot'; // Import the new component

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  schedules: Schedule[];
  watchers: Watcher[];
  onSelect: () => void;
  onEdit: () => void; // Edit Project
  onDelete: () => void; // Delete Project
  onAddSchedule: (projectId: string) => void; // Add new schedule to this project
  onAddWatcher: (projectId: string) => void;  // Add new watcher to this project

  // Handlers for actions on individual schedules/watchers within the card
  onEditScheduleItem: (scheduleId: string, projectId: string) => void;
  onDeleteScheduleItem: (scheduleId: string, projectId: string) => void;
  onToggleScheduleActiveItem: (scheduleId: string, currentActiveState: boolean, projectId: string) => void;
  onRunScheduleNowItem: (scheduleId: string, projectId: string) => void;

  onEditWatcherItem: (watcherId: string, projectId: string) => void;
  onDeleteWatcherItem: (watcherId: string, projectId: string) => void;
  onToggleWatcherActiveItem: (watcherId: string, currentActiveState: boolean, projectId: string) => void;
}

// Removed local ProjectColorDot definition

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isActive,
  schedules, // Changed
  watchers,  // Changed
  onSelect,
  onEdit,
  onDelete, // Project delete
  onAddSchedule, // Add new schedule to project
  onAddWatcher,  // Add new watcher to project
  // Item-specific handlers
  onEditScheduleItem,
  onDeleteScheduleItem,
  onToggleScheduleActiveItem,
  onRunScheduleNowItem,
  onEditWatcherItem,
  onDeleteWatcherItem,
  onToggleWatcherActiveItem,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpand = (e: React.MouseEvent) => {
    // Prevent click from propagating if it's on a button inside the trigger
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    
    if (!isExpanded && !isActive) {
      onSelect(); // Select if expanding and not active
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={(open) => {
        // If opening and not active, select it.
        if (open && !isActive) {
          onSelect();
        }
        setIsExpanded(open);
      }}
      className={cn(
        'border rounded-lg transition-shadow',
        // When active, use sidebar background and a ring. Otherwise, sidebar background with hover effect.
        isActive ? 'ring-2 ring-vscode-focusBorder bg-vscode-sideBar-background' : 'bg-vscode-sideBar-background hover:bg-vscode-list-hoverBackground',
      )}
    >
      <CollapsibleTrigger asChild>
        {/* The main clickable area for toggling expand/collapse and selection */}
        <div className="p-3 cursor-pointer w-full" onClick={handleToggleExpand}> {/* Reduced padding from p-4 to p-3 */}
          <div className="flex justify-between items-center mb-1.5"> {/* Reduced mb from mb-2 to mb-1.5 */}
            <div className="flex items-center min-w-0"> {/* Added min-w-0 for better truncation */}
              {isExpanded ? <ChevronDown className="h-4 w-4 mr-1.5 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 mr-1.5 flex-shrink-0" />} {/* Reduced mr */}
              <ProjectColorDot color={project.color} size="md"/> {/* Explicitly set size */}
              <h3 className="text-base font-medium text-vscode-sideBar-foreground truncate" title={project.name}> {/* Reduced text size, adjusted font weight, added truncate */}
                {project.name}
              </h3>
            </div>
            {/* Action buttons - kept space-x-1, might need adjustment if too cramped */}
            <div className="flex space-x-0.5 flex-shrink-0"> {/* Reduced space-x */}
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onAddSchedule(project.id); }} aria-label={`Add schedule to project ${project.name}`} title="Add Schedule" className="p-1">
                <span className="codicon codicon-calendar"></span>
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onAddWatcher(project.id); }} aria-label={`Add watcher to project ${project.name}`} title="Add Watcher" className="p-1">
                <span className="codicon codicon-eye"></span>
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={`Edit project ${project.name}`} title="Edit Project" className="p-1">
                <span className="codicon codicon-edit"></span>
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={`Delete project ${project.name}`} title="Delete Project" className="p-1">
                <span className="codicon codicon-trash"></span>
              </Button>
            </div>
          </div>
          {project.description && (
            <p className="text-xs text-vscode-descriptionForeground mb-1 truncate" title={project.description}>
              {project.description}
            </p>
          )}
          <p className="text-xs text-vscode-disabledForeground mb-1.5 truncate" title={project.directoryPath}> {/* Reduced mb */}
            {project.directoryPath || 'Directory not set'}
          </p>
          <div className="text-xs text-vscode-foreground">
            <span>{schedules.length} {schedules.length === 1 ? "Schedule" : "Schedules"}</span>
            <span className="mx-1.5">·</span> {/* Increased mx slightly */}
            <span>{watchers.length} {watchers.length === 1 ? "Watcher" : "Watchers"}</span>
          </div>
        </div>
      </CollapsibleTrigger>
      {/* Content area: using input-background for a slight offset, consistent with mini-cards */}
      <CollapsibleContent className="px-3 pb-3 pt-1.5 space-y-2 bg-vscode-input-background border-t border-vscode-editorGroup-border"> {/* Adjusted padding, space, bg, and added border-t */}
        {isExpanded && (
          <>
            {schedules.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-vscode-sideBar-foreground mb-1">Scheduled Tasks:</h4>
                <div className="space-y-1">
                  {schedules.map(schedule => (
                    <ScheduleMiniCard
                      key={schedule.id}
                      schedule={schedule}
                      projectName={project.name}
                      projectColor={project.color}
                      onEdit={() => onEditScheduleItem(schedule.id, project.id)}
                      onDelete={() => onDeleteScheduleItem(schedule.id, project.id)}
                      onToggleActive={() => onToggleScheduleActiveItem(schedule.id, !!schedule.active, project.id)}
                      onRunNow={() => onRunScheduleNowItem(schedule.id, project.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {watchers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-vscode-sideBar-foreground mb-1 mt-2">Watchers:</h4>
                <div className="space-y-1">
                  {watchers.map(watcher => (
                    <WatcherMiniCard
                      key={watcher.id}
                      watcher={watcher}
                      projectName={project.name}
                      projectColor={project.color}
                      onEdit={() => onEditWatcherItem(watcher.id, project.id)}
                      onDelete={() => onDeleteWatcherItem(watcher.id, project.id)}
                      onToggleActive={() => onToggleWatcherActiveItem(watcher.id, !!watcher.active, project.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {schedules.length === 0 && watchers.length === 0 && (
              <p className="text-xs text-vscode-descriptionForeground">No schedules or watchers for this project.</p>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ProjectCard;