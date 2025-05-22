import React, { useState, useMemo, useRef, useEffect } from "react"; // Added useEffect
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent } from "../../components/ui/tabs";
import { useExtensionState } from "../../context/ExtensionStateContext";
// Plus icon is no longer used here as the add button is global
import { vscode } from "../../utils/vscode";
// import { Tab, TabContent, TabHeader } from "../common/Tab"; // Tab seems unused
import { Watcher } from "./types";
import WatcherForm from "./WatcherForm";
import WatcherList from "./WatcherList";
import type { WatcherFormHandle } from "./WatcherForm";
import ConfirmationDialog from "../ui/confirmation-dialog";
import { getAllModes } from "../../../../src/shared/modes";
import SplashPage from "../common/SplashPage";
import type { Project } from "../../../../src/shared/ProjectTypes"; // Import Project
import type { NavigationPayload } from "../../types"; // Import NavigationPayload

interface WatchersViewProps {
  initialAction?: NavigationPayload | null;
  onInitialActionConsumed?: () => void;
}

const WatchersView: React.FC<WatchersViewProps> = ({ initialAction, onInitialActionConsumed }) => {
  const { customModes, projects, projectWatchers, activeProjectId, setActiveProjectId } = useExtensionState();
  const [activeTab, setActiveTab] = useState<string>("watchers");

  const watchers: Watcher[] = useMemo(() => {
    if (activeProjectId && projectWatchers && projectWatchers[activeProjectId]) {
      return projectWatchers[activeProjectId] as Watcher[];
    }
    return [];
  }, [activeProjectId, projectWatchers]);
  const [selectedWatcherId, setSelectedWatcherId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [initialFormData, setInitialFormData] = useState<Partial<Watcher>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [watcherToDelete, setWatcherToDelete] = useState<string | null>(null);
  const watcherFormRef = useRef<WatcherFormHandle>(null); // Uncommented
  const [isFormValid, setIsFormValid] = useState(false);

  const availableModes = useMemo(() => getAllModes(customModes), [customModes]);

  // Helper function to format dates (can be moved to a common util later)
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric', // Keep year for watchers for clarity
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  useEffect(() => {
    if (initialAction?.view === 'form' && onInitialActionConsumed) {
      resetForm(); // Clear any previous editing state
      if (initialAction.itemId && initialAction.projectId) {
        // Editing an existing watcher
        console.log("WatchersView: Processing initialAction to EDIT form for watcher:", initialAction.itemId, "in project:", initialAction.projectId);
        const projectWatchersMap = projectWatchers || {};
        const watchersForProject = projectWatchersMap[initialAction.projectId] || [];
        const watcherToEdit = watchersForProject.find(w => w.id === initialAction.itemId);
        if (watcherToEdit) {
          setSelectedWatcherId(watcherToEdit.id);
          setInitialFormData({ ...watcherToEdit }); // Populate form with existing data
          setIsEditing(true);
          setActiveTab("edit");
        } else {
          console.warn(`WatchersView: Watcher with id ${initialAction.itemId} not found in project ${initialAction.projectId}`);
          // Fallback to new watcher form for the project, or handle error
          setInitialFormData({ projectId: initialAction.projectId });
          setIsEditing(false);
          setActiveTab("edit");
        }
      } else if (initialAction.projectId) {
        // Creating a new watcher for a specific project
        console.log("WatchersView: Processing initialAction to CREATE new form for project:", initialAction.projectId);
        setInitialFormData({ projectId: initialAction.projectId });
        setIsEditing(false);
        setActiveTab("edit");
      } else {
        // Creating a new watcher without a pre-selected project (form will require selection)
        // Use activeProjectId if available from context as a default for new items
        console.log("WatchersView: Processing initialAction to CREATE new form (project from active context or none):", activeProjectId);
        setInitialFormData(prev => ({ ...prev, projectId: activeProjectId || undefined }));
        setIsEditing(false);
        setActiveTab("edit");
      }
      onInitialActionConsumed(); // Notify App.tsx that the action has been processed
    }
  }, [initialAction, onInitialActionConsumed, projectWatchers, activeProjectId]);

  const saveWatcher = (formData: Omit<Watcher, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'> & { projectId: string }) => {
  	if (!formData.projectId) {
  		console.error("Project ID is missing in form data. Cannot save watcher.");
  		return;
  	}
  	const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode);
  	const modeDisplayName = selectedModeConfig?.name || formData.mode;
  	
  	// watcherPayload will already have projectId from the form.
  	const watcherPayload = { ...formData, modeDisplayName };
 
  	if (isEditing && selectedWatcherId) {
  		const existingWatcher = watchers.find(w => w.id === selectedWatcherId);
  		if (existingWatcher) {
  			vscode.postMessage({
  				type: "updateWatcherInProject",
  				projectId: watcherPayload.projectId, // Use projectId from form for targeting
  				data: { ...existingWatcher, ...watcherPayload } as Watcher,
  			});
  		}
  	} else {
  		vscode.postMessage({
  			type: "addWatcherToProject",
  			projectId: watcherPayload.projectId, // Use projectId from form for targeting
  			data: watcherPayload, // data already contains projectId
  		});
  	}
  	resetForm();
  	setActiveTab("watchers");
  };

  const editWatcher = (watcherId: string) => {
    const watcher = watchers.find(w => w.id === watcherId);
    if (watcher) {
      setSelectedWatcherId(watcherId);
      setInitialFormData({ ...watcher });
      setIsEditing(true);
      setActiveTab("edit");
    }
  };

  const deleteWatcher = (watcherIdToDelete: string) => {
    if (!activeProjectId) {
      console.error("Cannot delete watcher: No active project selected.");
      return;
    }
    vscode.postMessage({
      type: "deleteWatcherFromProject",
      projectId: activeProjectId,
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
  	// activeProjectId will be used by WatcherForm to pre-select the project if set.
  	// If not set, WatcherForm's dropdown will be mandatory.
  	resetForm();
  	setInitialFormData(prev => ({ ...prev, projectId: activeProjectId || undefined }));
  	setActiveTab("edit");
  };
  
  const toggleWatcherActiveState = (watcherIdToToggle: string, currentActiveState: boolean | undefined) => {
    if (!activeProjectId) return;
    const watcherToUpdate = watchers.find(w => w.id === watcherIdToToggle);
    if (watcherToUpdate) {
      vscode.postMessage({
          type: "updateWatcherInProject",
          projectId: activeProjectId,
          data: { ...watcherToUpdate, active: !(currentActiveState !== false), projectId: activeProjectId } as Watcher,
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header section removed as per new instructions */}
      
      {/* Inner Tabs for list/edit form */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow pt-2"> {/* Added pt-2 for spacing */}
        <TabsContent value="watchers" className="space-y-2 flex-1 overflow-auto px-2"> {/* Added px-2 */}
            {!activeProjectId ? (
              <div className="text-center py-8 text-vscode-descriptionForeground">
                Please select or create a project to manage watchers.
              </div>
            ) : watchers.length === 0 ? (
              <SplashPage />
            ) : (
              <div className="h-full flex flex-col">
                <WatcherList
                  watchers={watchers}
                  projects={projects || []} // Pass projects array
                  onEdit={editWatcher}
                  onDelete={(id) => {
                    setWatcherToDelete(id);
                    setDialogOpen(true);
                  }}
                  onDuplicate={(watcherId) => {
                    if (!activeProjectId) return;
                    const watcherToDuplicate = watchers.find(w => w.id === watcherId);
                    if (watcherToDuplicate) {
                    	const { id, createdAt, updatedAt, lastTriggeredTime, lastTaskId, projectId: projectToDuplicateIn, ...duplicableData } = watcherToDuplicate;
                    	saveWatcher({
                    		...duplicableData,
                    		projectId: projectToDuplicateIn, // Explicitly set projectId
                    		name: `${duplicableData.name} (Copy)`,
                    		active: false, // Duplicates are inactive by default
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
          <TabsContent value="edit" className="flex-1 overflow-auto px-2"> {/* Added px-2 and flex-1, removed mt-4 */}
            <WatcherForm
              ref={watcherFormRef}
              initialData={initialFormData}
              isEditing={isEditing}
              availableModes={availableModes}
              onSave={saveWatcher}
              onCancel={() => { // This onCancel is for the form itself, if it has one.
                resetForm();
                setActiveTab("watchers");
              }}
              onValidityChange={setIsFormValid}
            />
            {/* Save and Cancel buttons for the form */}
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
      {/* Confirmation Dialog for Watcher Deletion, moved to be a sibling of Tabs */}
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
