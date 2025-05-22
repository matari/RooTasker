import React from 'react';
import type { Watcher } from '../watchers/types';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { Edit3, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import ProjectColorDot from './ProjectColorDot'; // Import ProjectColorDot

interface WatcherMiniCardProps {
  watcher: Watcher;
  projectName: string; // Added prop
  projectColor: string; // Added prop
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

const WatcherMiniCard: React.FC<WatcherMiniCardProps> = ({
  watcher,
  projectName, // Added prop
  projectColor, // Added prop
  onEdit,
  onDelete,
  onToggleActive,
}) => {
  const cardBaseClasses = "p-2 border rounded text-xs flex justify-between items-center";
  const activeBg = "bg-vscode-input-background";
  const inactiveBg = "bg-vscode-input-background opacity-60";

  return (
    <div className={cn(cardBaseClasses, watcher.active ? activeBg : inactiveBg)}>
      {/* Project and Watcher Name Block */}
      <div className="flex-grow flex items-center min-w-0 space-x-1.5"> {/* Use space-x for consistent spacing */}
        <ProjectColorDot color={projectColor} size="xs" />
        <span className="font-normal text-vscode-descriptionForeground truncate" title={projectName}>
          {projectName}:
        </span>
        <span className="font-medium text-vscode-input-foreground ml-1 truncate" title={watcher.name}> {/* Added ml-1 for spacing */}
          {watcher.name}
        </span>
      </div>
      
      {/* Action Buttons */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onToggleActive(); }} title={watcher.active ? "Deactivate" : "Activate"} className="p-1">
          {watcher.active ? <ToggleRight className="h-3 w-3 text-green-500" /> : <ToggleLeft className="h-3 w-3" />}
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

export default WatcherMiniCard;