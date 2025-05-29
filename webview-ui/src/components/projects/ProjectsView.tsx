import React, { useState, useMemo } from 'react'; // Added useState and useMemo
import { useExtensionState } from '../../context/ExtensionStateContext';
import { Button } from '../ui/button';
import FilterInput from '../common/FilterInput'; // Added FilterInput import
import type { Project } from '../../../../src/shared/ProjectTypes';
import ProjectCard from './ProjectCard'; // Uncommented
import ProjectForm from './ProjectForm'; // Uncommented
import { vscode } from '../../utils/vscode'; // Added for posting messages
import SplashPage from '../common/SplashPage'; // Added import

interface ProjectsViewProps {
  onNavigateToTab: (tabKey: 'scheduler' | 'watchers', payload?: { view?: 'form'; projectId?: string; itemId?: string }) => void;
  isNewProjectModalOpen: boolean;
  onCloseNewProjectModal: () => void;
  onOpenEditProjectModal: (project: Project) => void;
}

const ProjectsView: React.FC<ProjectsViewProps> = ({
  onNavigateToTab,
  isNewProjectModalOpen,
  onCloseNewProjectModal,
  onOpenEditProjectModal
}) => {
  const { projects, projectSchedules, projectWatchers, activeProjectId, setActiveProjectId } = useExtensionState();
  // showProjectForm is now controlled by App.tsx for "new", but editingProject still triggers form locally
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);
  const [filterText, setFilterText] = useState(''); // Added filter text state

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!filterText.trim()) return projects;
    const lowerFilterText = filterText.toLowerCase();
    return projects.filter(project => 
      project.name.toLowerCase().includes(lowerFilterText) ||
      (project.description && project.description.toLowerCase().includes(lowerFilterText))
    );
  }, [projects, filterText]);

  const handleSaveProject = (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> | Project) => {
    if ('id' in data) { // Editing existing project
      vscode.postMessage({ type: 'updateProject', data });
    } else { // Creating new project
      vscode.postMessage({ type: 'createProject', data });
    }
    // setShowProjectForm(false); // Controlled by App.tsx for new, or local for edit
    if (editingProject) { // If was editing, clear editingProject and let local logic close
      setEditingProject(null);
    } else { // If was new, call the prop to close modal in App.tsx
      onCloseNewProjectModal();
    }
  };

  const handleDeleteProject = (projectId: string) => {
    // Optional: Add a confirmation dialog here
    vscode.postMessage({ type: 'deleteProject', projectId });
  };
  
  const handleSetActiveProject = (newProjectId: string | null) => {
  	const currentActiveId = activeProjectId; // Capture current activeProjectId from context
  	if (setActiveProjectId) {
  		setActiveProjectId(newProjectId);
  	}
  	// Also send message to backend if backend needs to know the active project
  	vscode.postMessage({ type: 'setActiveProject', projectId: newProjectId === null ? undefined : newProjectId });
 
  	// Navigation to watchers tab upon project activation has been removed.
    // Navigation should be explicit via "Add Watcher/Schedule" or item clicks.
  };
 
  const handleAddScheduleToProject = (projectId: string) => {
    handleSetActiveProject(projectId);
    onNavigateToTab('scheduler', { view: 'form', projectId });
  };

  const handleAddWatcherToProject = (projectId: string) => {
    handleSetActiveProject(projectId);
    onNavigateToTab('watchers', { view: 'form', projectId });
  };


  // Handlers for actions on items within ProjectCard
  const handleEditScheduleItem = (scheduleId: string, projectId: string) => {
    handleSetActiveProject(projectId); // Ensure project is active
    // Pass itemId to navigate to the form in edit mode for that specific schedule
    onNavigateToTab('scheduler', { view: 'form', projectId, itemId: scheduleId });
  };
  const handleDeleteScheduleItem = (scheduleId: string, projectId: string) => {
    vscode.postMessage({ type: 'deleteScheduleFromProject', projectId, scheduleId });
  };
  const handleToggleScheduleActiveItem = (scheduleId: string, currentActiveState: boolean, projectId: string) => {
    const projectSchedulesMap = projectSchedules || {};
    const schedulesForProject = projectSchedulesMap[projectId] || [];
    const scheduleToUpdate = schedulesForProject.find(s => s.id === scheduleId);
    if (scheduleToUpdate) {
      vscode.postMessage({
        type: 'updateScheduleInProject',
        projectId,
        data: { ...scheduleToUpdate, active: !currentActiveState },
      });
    }
  };
  const handleRunScheduleNowItem = (scheduleId: string, projectId: string) => {
    vscode.postMessage({ type: 'runScheduleNow', scheduleId, projectId });
  };

  const handleEditWatcherItem = (watcherId: string, projectId: string) => {
    handleSetActiveProject(projectId); // Ensure project is active
    // Pass itemId to navigate to the form in edit mode for that specific watcher
    onNavigateToTab('watchers', { view: 'form', projectId, itemId: watcherId });
  };
  const handleDeleteWatcherItem = (watcherId: string, projectId: string) => {
    vscode.postMessage({ type: 'deleteWatcherFromProject', projectId, watcherId });
  };
  const handleToggleWatcherActiveItem = (watcherId: string, currentActiveState: boolean, projectId: string) => {
    const projectWatchersMap = projectWatchers || {};
    const watchersForProject = projectWatchersMap[projectId] || [];
    const watcherToUpdate = watchersForProject.find(w => w.id === watcherId);
    if (watcherToUpdate) {
      vscode.postMessage({
        type: 'updateWatcherInProject',
        projectId,
        data: { ...watcherToUpdate, active: !currentActiveState },
      });
    }
  };

  if (!projects || !projectSchedules || !projectWatchers) {
    // Ensure all required data from context is loaded
    return <div className="p-4">Loading project data...</div>;
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4">
      <FilterInput
        value={filterText}
        onValueChange={setFilterText}
        placeholder="Filter projects by name or description..."
        // className="mb-0" // Removed mb-0 to allow parent's space-y-4 to apply
      />
      <ProjectForm
        isOpen={isNewProjectModalOpen || !!editingProject} // Open if new modal is triggered OR if editing
        onClose={() => {
          if (editingProject) {
            setEditingProject(null); // Local close for edit
          } else {
            onCloseNewProjectModal(); // Prop close for new
          }
        }}
        project={editingProject} // This will be null for "new", or a project for "edit"
        onSave={handleSaveProject}
      />
   
      {projects.length === 0 && !isNewProjectModalOpen && !editingProject && (
      	<div className="flex-grow flex items-center justify-center h-full"> {/* Ensure it takes full height for SplashPage */}
      		<SplashPage tabType="projects" />
      	</div>
      )}
   
      {/* Container for the list of project cards. Added p-1 for overall padding. */}
      <div className="flex-grow overflow-auto space-y-3 p-1">
        {filteredProjects.map((project) => {
          const schedulesForProject = projectSchedules && projectSchedules[project.id] ? projectSchedules[project.id] : [];
          const watchersForProject = projectWatchers && projectWatchers[project.id] ? projectWatchers[project.id] : [];
          return (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={project.id === activeProjectId}
              schedules={schedulesForProject}
              watchers={watchersForProject}
              onSelect={() => handleSetActiveProject(project.id === activeProjectId ? null : project.id)}
              onEdit={() => {
                setEditingProject(project);
                // For editing, we still manage the form opening locally via editingProject state.
                // Alternatively, App.tsx could manage an `editingProjectId` state.
                // For now, onOpenEditProjectModal is a placeholder if we want App.tsx to control edit form too.
                // onOpenEditProjectModal(project);
              }}
              onDelete={() => handleDeleteProject(project.id)}
              onAddSchedule={() => handleAddScheduleToProject(project.id)}
              onAddWatcher={() => handleAddWatcherToProject(project.id)}
              onEditScheduleItem={handleEditScheduleItem}
              onDeleteScheduleItem={handleDeleteScheduleItem}
              onToggleScheduleActiveItem={handleToggleScheduleActiveItem}
              onRunScheduleNowItem={handleRunScheduleNowItem}
              onEditWatcherItem={handleEditWatcherItem}
              onDeleteWatcherItem={handleDeleteWatcherItem}
              onToggleWatcherActiveItem={handleToggleWatcherActiveItem}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ProjectsView;
