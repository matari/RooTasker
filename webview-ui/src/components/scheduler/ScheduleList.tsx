import React from "react";
import { Virtuoso } from "react-virtuoso";
import ScheduleListItem from "./ScheduleListItem";
import { Schedule } from "./types";

type ScheduleListProps = {
  schedules: Schedule[];
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
        itemContent={(_, schedule) => (
          <ScheduleListItem
            key={schedule.id}
            schedule={schedule}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleActive={onToggleActive}
            onRunNow={onRunNow}
            onDuplicate={onDuplicate} // Added
            onResumeTask={onResumeTask}
            formatDate={formatDate}
          />
        )}
      />
    </div>
  );
};

export default ScheduleList;
