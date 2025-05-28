import React, { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select
import { useExtensionState } from "../../context/ExtensionStateContext";
import { vscode } from "../../utils/vscode";
import { Watcher } from "./types"; // Ensure Watcher type includes projectId
import WatcherForm from "./WatcherForm";
import WatcherList from "./WatcherList";
import type { WatcherFormHandle } from "./WatcherForm";
import ConfirmationDialog from "../ui/confirmation-dialog";
import { getAllModes } from "../../../../src/shared/modes";
import SplashPage from "../common/SplashPage";
import type { Project } from "../../../../src/shared/ProjectTypes";
import type { NavigationPayload } from "../../types";
import { ArrowDownUp, ArrowUpNarrowWide, ArrowDownNarrowWide } from "lucide-react"; // Icons for sorting

interface WatchersViewProps {
  initialAction?: NavigationPayload | null;
  onInitialActionConsumed?: () => void;
}

type WatcherSortCriteria = "name" | "projectName" | "status" | "lastTriggeredTime" | "createdAt";
type SortDirection = "asc" | "desc";

const WatchersView: React.FC<WatchersViewProps> = ({ initialAction, onInitialActionConsumed }) => {
  const { customModes, projects, projectWatchers, activeProjectId } = useExtensionState(); // Removed setActiveProjectId as filter is local
  
  const [activeTab, setActiveTab] = useState<string>("watchers");
  const [filterProjectId, setFilterProjectId] = useState<string>("all"); // "all" or a project ID

  // Sorting state
  const [sortCriteria, setSortCriteria] = useState<WatcherSortCriteria>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const watchersWithProjectName = useMemo(() => {
    if (!projectWatchers) return [];
    let allWatchers: Watcher[] = [];
    if (filterProjectId === "all") {
      allWatchers = Object.values(projectWatchers).flat();
    } else {
      allWatchers = projectWatchers[filterProjectId] || [];
    }
    return allWatchers.map(w => ({
      ...w,
      projectName: projects?.find(p => p.id === w.projectId)?.name || "Unknown Project",
    }));
  }, [filterProjectId, projectWatchers, projects]);

  const displayedWatchers = useMemo(() => {
    let sorted = [...watchersWithProjectName];
    sorted.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortCriteria) {
        case "name":
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case "projectName":
          valA = a.projectName?.toLowerCase() || '';
          valB = b.projectName?.toLowerCase() || '';
          break;
        case "status": // Assuming 'active' boolean: true (active) comes before false (inactive)
          valA = a.active === false ? 1 : 0; // false is "greater" so it comes later in asc
          valB = b.active === false ? 1 : 0;
          break;
        case "lastTriggeredTime":
          valA = a.lastTriggeredTime ? new Date(a.lastTriggeredTime).getTime() : 0;
          valB = b.lastTriggeredTime ? new Date(b.lastTriggeredTime).getTime() : 0;
          break;
        case "createdAt":
          valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [watchersWithProjectName, sortCriteria, sortDirection]);
  
  const [selectedWatcherId, setSelectedWatcherId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [initialFormData, setInitialFormData] = useState<Partial<Watcher>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [watcherToDelete, setWatcherToDelete] = useState<string | null>(null);
  const watcherFormRef = useRef<WatcherFormHandle>(null);
  const [isFormValid, setIsFormValid] = useState(false);

  const availableModes = useMemo(() => getAllModes(customModes), [customModes]);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  useEffect(() => {
    if (initialAction?.view === 'form' && onInitialActionConsumed) {
      resetForm();
      if (initialAction.itemId && initialAction.projectId) {
        console.log("WatchersView: Processing initialAction to EDIT form for watcher:", initialAction.itemId, "in project:", initialAction.projectId);
        const projectWatchersMap = projectWatchers || {};
        const watchersForProject = projectWatchersMap[initialAction.projectId] || [];
        const watcherToEdit = watchersForProject.find(w => w.id === initialAction.itemId);
        if (watcherToEdit) {
          setFilterProjectId(initialAction.projectId); // Set filter to this project
          setSelectedWatcherId(watcherToEdit.id);
          setInitialFormData({ ...watcherToEdit });
          setIsEditing(true);
          setActiveTab("edit");
        } else {
          console.warn(`WatchersView: Watcher with id ${initialAction.itemId} not found in project ${initialAction.projectId}`);
          setFilterProjectId(initialAction.projectId);
          setInitialFormData({ projectId: initialAction.projectId });
          setIsEditing(false);
          setActiveTab("edit");
        }
      } else if (initialAction.projectId) {
        console.log("WatchersView: Processing initialAction to CREATE new form for project:", initialAction.projectId);
        setFilterProjectId(initialAction.projectId);
        setInitialFormData({ projectId: initialAction.projectId });
        setIsEditing(false);
        setActiveTab("edit");
      } else {
        console.log("WatchersView: Processing initialAction to CREATE new form (project from active context or none):", activeProjectId);
        setInitialFormData(prev => ({ ...prev, projectId: filterProjectId !== "all" ? filterProjectId : activeProjectId || undefined }));
        setIsEditing(false);
        setActiveTab("edit");
      }
      onInitialActionConsumed();
    }
  }, [initialAction, onInitialActionConsumed, projectWatchers, activeProjectId, filterProjectId]);

  const saveWatcher = (formData: Omit<Watcher, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string }) => {
  	if (!formData.projectId) {
  		console.error("Project ID is missing in form data. Cannot save watcher.");
  		return;
  	}
  	const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode);
  	const modeDisplayName = selectedModeConfig?.name || formData.mode;
  	
  	const watcherPayload = { ...formData, modeDisplayName };
 
  	if (isEditing && selectedWatcherId) {
  		const existingWatcher = displayedWatchers.find(w => w.id === selectedWatcherId);
  		if (existingWatcher) {
  			vscode.postMessage({
  				type: "updateWatcherInProject",
  				projectId: watcherPayload.projectId, 
  				data: { ...existingWatcher, ...watcherPayload } as Watcher,
  			});
  		}
  	} else {
  		vscode.postMessage({
  			type: "addWatcherToProject",
  			projectId: watcherPayload.projectId, 
  			data: watcherPayload, 
  		});
  	}
  	resetForm();
  	setActiveTab("watchers");
  };

  const editWatcher = (watcherId: string) => {
    const watcher = displayedWatchers.find(w => w.id === watcherId);
    if (watcher) {
      setSelectedWatcherId(watcherId);
      if (watcher.projectId) setFilterProjectId(watcher.projectId);
      setInitialFormData({ ...watcher });
      setIsEditing(true);
      setActiveTab("edit");
    }
  };

  const deleteWatcher = (watcherIdToDelete: string) => {
    const watcherRef = displayedWatchers.find(w => w.id === watcherIdToDelete);
    const finalProjectId = watcherRef?.projectId || (filterProjectId !== "all" ? filterProjectId : activeProjectId);

    if (!finalProjectId) {
      console.error("Cannot delete watcher: Project ID could not be determined.");
      return;
    }
    vscode.postMessage({
      type: "deleteWatcherFromProject",
      projectId: finalProjectId,
      watcherId: watcherIdToDelete,
    });
    if (selectedWatcherId === watcherIdToDelete) {
      resetForm();
    }
  };

  const resetForm = () => {
    setSelectedWatcherId(null);
    setInitialFormData({});
    setIsEditing(false);
  };

  const createNewWatcher = () => {
  	resetForm();
  	setInitialFormData(prev => ({ ...prev, projectId: filterProjectId !== "all" ? filterProjectId : activeProjectId || undefined }));
  	setActiveTab("edit");
  };
  
  const toggleWatcherActiveState = (watcherIdToToggle: string, currentActiveState: boolean | undefined) => {
    const watcherToUpdate = displayedWatchers.find(w => w.id === watcherIdToToggle);
    if (watcherToUpdate && watcherToUpdate.projectId) {
      vscode.postMessage({
          type: "updateWatcherInProject",
          projectId: watcherToUpdate.projectId,
          data: { ...watcherToUpdate, active: !(currentActiveState !== false) } as Watcher,
      });
    } else {
      console.error("Cannot toggle watcher state: Watcher or its projectId not found.");
    }
  };

  const handleSortDirectionToggle = () => {
    setSortDirection(prev => prev === "asc" ? "desc" : "asc");
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow pt-2">
        <TabsContent value="watchers" className="space-y-2 flex-1 overflow-auto px-2">
            {(filterProjectId === "all" && (!projects || projects.length === 0)) ? (
              <div className="text-center py-8 text-vscode-descriptionForeground">
                Please create a project to manage watchers.
               </div>
              ) : displayedWatchers.length === 0 && filterProjectId === "all" ? (
               <SplashPage tabType="watchers" />
              ) : displayedWatchers.length === 0 && filterProjectId !== "all" ? (
                <div className="text-center py-8 text-vscode-descriptionForeground">
                  No watchers found for this project. <Button variant="link" className="p-0 h-auto" onClick={createNewWatcher}>Create one?</Button>
                </div>
              ) : (
               <div className="h-full flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-2 px-1 pt-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="project-filter-watchers" className="text-sm text-vscode-descriptionForeground">Project:</label>
                    <Select value={filterProjectId} onValueChange={setFilterProjectId}>
                      <SelectTrigger id="project-filter-watchers" className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Filter by project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="sort-criteria-watchers" className="text-sm text-vscode-descriptionForeground">Sort by:</label>
                    <Select value={sortCriteria} onValueChange={(value) => setSortCriteria(value as WatcherSortCriteria)}>
                        <SelectTrigger id="sort-criteria-watchers" className="w-[150px] h-8 text-xs">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="projectName">Project Name</SelectItem>
                            <SelectItem value="status">Status</SelectItem>
                            <SelectItem value="lastTriggeredTime">Last Triggered</SelectItem>
                            <SelectItem value="createdAt">Date Created</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={handleSortDirectionToggle} className="h-8 w-8 p-0">
                        {sortDirection === "asc" ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownNarrowWide className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <WatcherList
                  watchers={displayedWatchers}
                  projects={projects || []} 
                  onEdit={editWatcher}
                  onDelete={(id) => {
                    setWatcherToDelete(id);
                    setDialogOpen(true);
                  }}
                  onDuplicate={(watcherId) => {
                    const watcherToDuplicate = displayedWatchers.find(w => w.id === watcherId);
                    if (watcherToDuplicate && watcherToDuplicate.projectId) {
                    	const { id, createdAt, updatedAt, lastTriggeredTime, lastTaskId, ...duplicableData } = watcherToDuplicate;
                    	saveWatcher({
                    		...(duplicableData as Omit<Watcher, 'id'|'createdAt'|'updatedAt'|'lastTriggeredTime'|'lastTaskId'|'modeDisplayName'>),
                    		name: `${(duplicableData as {name?: string}).name || 'Watcher'} (Copy)`,
                    		active: false, 
                            projectId: watcherToDuplicate.projectId,
                    	} as Omit<Watcher, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string });
                    }
                   }}
                   onToggleActive={toggleWatcherActiveState}
                  onResumeTask={(taskId) => vscode.postMessage({ type: "resumeTask", taskId })}
                  formatDate={formatDate}
                />
              </div>
            )}
          </TabsContent>
          <TabsContent value="edit" className="flex-1 overflow-auto px-2">
            <WatcherForm
              ref={watcherFormRef}
              initialData={initialFormData}
              isEditing={isEditing}
              availableModes={availableModes}
              onSave={saveWatcher}
              onCancel={() => { 
                resetForm();
                setActiveTab("watchers");
              }}
              onValidityChange={setIsFormValid}
            />
            {activeTab === "edit" && (
              <div className="flex justify-end gap-2 mt-4 p-1 border-t border-vscode-panel-border">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setActiveTab("watchers");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => watcherFormRef.current?.submitForm()}
                  disabled={!isFormValid}
                >
                  Save Watcher
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      <ConfirmationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Delete Watcher"
        description="Are you sure you want to delete this watcher? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (watcherToDelete) {
            deleteWatcher(watcherToDelete);
            setWatcherToDelete(null);
          }
        }}
        confirmClassName="bg-vscode-errorForeground hover:bg-vscode-errorForeground/90"
      />
    </div>
  );
};

export default WatchersView;
