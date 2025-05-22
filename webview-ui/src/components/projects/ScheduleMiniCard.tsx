import React from 'react';
import type { Schedule } from '../scheduler/types';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { Edit3, Trash2, Play, ToggleLeft, ToggleRight } from 'lucide-react';
import ProjectColorDot from './ProjectColorDot'; // Import ProjectColorDot

interface ScheduleMiniCardProps {
  schedule: Schedule;
  projectName: string; // Added prop
  projectColor: string; // Added prop
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onRunNow: () => void;
}

const ScheduleMiniCard: React.FC<ScheduleMiniCardProps> = ({
  schedule,
  projectName, // Added prop
  projectColor, // Added prop
  onEdit,
  onDelete,
  onToggleActive,
  onRunNow,
}) => {
  const cardBaseClasses = "p-2 border rounded text-xs flex justify-between items-center";
  const activeBg = "bg-vscode-input-background";
  const inactiveBg = "bg-vscode-input-background opacity-60";

  // Basic date formatter (can be enhanced)
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      // Using a more specific format for next run time for brevity
      return new Date(dateString).toLocaleTimeString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className={cn(cardBaseClasses, schedule.active ? activeBg : inactiveBg)}>
      {/* Main content area for name, project, and next run time */}
      <div className="flex-grow flex items-center min-w-0 space-x-1.5"> {/* Added space-x-1.5 for spacing between main items */}
        {/* Project and Schedule Name Block */}
        <div className="flex items-center min-w-0 flex-shrink"> {/* Allow this block to shrink, min-w-0 for truncation */}
          <ProjectColorDot color={projectColor} size="xs" />
          <span className="font-normal text-vscode-descriptionForeground truncate" title={projectName}>
            {projectName}:
          </span>
          <span className="font-medium text-vscode-input-foreground ml-1 truncate" title={schedule.name}> {/* Added ml-1 for spacing */}
            {schedule.name}
          </span>
        </div>

        {/* Next Execution Time - allow it to shrink if necessary */}
        <span className="text-vscode-descriptionForeground text-xs flex-shrink-0 whitespace-nowrap"> {/* Removed ml-2, using parent space-x. Added whitespace-nowrap */}
          (Next: {formatDate(schedule.nextExecutionTime)})
        </span>
      </div>
      
      {/* Action Buttons */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRunNow(); }} title="Run now" className="p-1">
          <Play className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onToggleActive(); }} title={schedule.active ? "Deactivate" : "Activate"} className="p-1">
          {schedule.active ? <ToggleRight className="h-3 w-3 text-green-500" /> : <ToggleLeft className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit" className="p-1">
          <Edit3 className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete" className="p-1">
          <Trash2 className="h-3 w-3 text-vscode-errorForeground" />
        </Button>
      </div>
    </div>
  );
};

export default ScheduleMiniCard;