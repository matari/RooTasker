import React from "react";
import { Virtuoso } from "react-virtuoso";
import { Watcher } from "./types";
import WatcherListItem from "./WatcherListItem";

interface WatcherListProps {
  watchers: Watcher[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean | undefined) => void;
  onDuplicate: (id: string) => void; // Added duplicate functionality
  onResumeTask: (taskId: string) => void;
  formatDate: (dateString: string) => string; 
}

const WatcherList: React.FC<WatcherListProps> = ({
  watchers,
  onEdit,
  onDelete,
  onToggleActive,
  onDuplicate, // Added
  onResumeTask,
  formatDate,
}) => {
  if (watchers.length === 0) {
    return (
      <div className="text-center py-8 text-vscode-descriptionForeground">
        No watchers found. Create your first watcher to get started.
      </div>
    );
  }

  return (
    <Virtuoso
      style={{ height: "100%" }} // Ensure Virtuoso takes full available height
      data={watchers}
      itemContent={(index, watcher) => (
        <WatcherListItem
          key={watcher.id}
          watcher={watcher}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          onDuplicate={onDuplicate} // Added
          onResumeTask={onResumeTask}
          formatDate={formatDate}
        />
      )}
    />
  );
};

export default WatcherList;
