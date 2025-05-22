import React from "react";
import { Virtuoso } from "react-virtuoso";
import ScheduleListItem from "./ScheduleListItem";
import { Schedule } from "./types";
import type { Project } from "../../../../src/shared/ProjectTypes"; // Import Project type

type ScheduleListProps = {
  schedules: Schedule[];
  projects: Project[]; // Add projects prop
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onRunNow: (id: string) => void;
  onDuplicate: (id: string) => void; // Added for duplicate functionality
  onResumeTask: (taskId: string) => void;
  formatDate: (dateString: string) => string;
};

const ScheduleList: React.FC<ScheduleListProps> = ({
  schedules,
  projects, // Add projects prop
  onEdit,
  onDelete,
  onToggleActive,
  onRunNow,
  onDuplicate, // Added
  onResumeTask,
  formatDate,
}) => {
  return (
    <div className="flex-1 h-full">
      <Virtuoso
        style={{
          height: "100%",
          overflowY: "auto",
        }}
        data={schedules}
        data-testid="virtuoso-container"
        initialTopMostItemIndex={0}
        components={{
          List: React.forwardRef((props, ref) => (
            <div {...props} ref={ref} data-testid="virtuoso-item-list" />
          )),
        }}
        itemContent={(_, schedule) => {
          const project = projects.find(p => p.id === schedule.projectId);
          return (
            <ScheduleListItem
              key={schedule.id}
              schedule={schedule}
              projectName={project?.name}
              projectColor={project?.color}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              onRunNow={onRunNow}
              onDuplicate={onDuplicate} // Added
              onResumeTask={onResumeTask}
              formatDate={formatDate}
            />
          );
        }}
      />
    </div>
  );
};

export default ScheduleList;
