import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useExtensionState } from "../../context/ExtensionStateContext";
import { vscode } from "../../utils/vscode";
import { Tab, TabContent, TabHeader } from "../common/Tab";
import { Watcher } from "./types";
import WatcherForm from "./WatcherForm"; // Uncommented
import WatcherList from "./WatcherList"; // Uncommented
import type { WatcherFormHandle } from "./WatcherForm"; // Uncommented
import ConfirmationDialog from "../ui/confirmation-dialog";
import { getAllModes } from "../../../../src/shared/modes";


const WatchersView: React.FC = () => {
  const { customModes } = useExtensionState();
  const [activeTab, setActiveTab] = useState<string>("watchers"); // "watchers" or "edit"
  const [watchers, setWatchers] = useState<Watcher[]>([]);
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
    loadWatchers();

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "fileContent" && message.path === "./.rootasker/watchers.json") {
        try {
          const data = JSON.parse(message.content);
          if (data && Array.isArray(data.watchers)) {
            setWatchers(data.watchers);
          }
        } catch (e) {
          console.error("Failed to parse watchers from file content message:", e);
        }
      }
      if (message.type === "watchersUpdated") { // Assuming a similar notification mechanism
        loadWatchers();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadWatchers = () => {
    vscode.postMessage({
      type: "openFile", // Re-use openFile or create a dedicated message type
      text: "./.rootasker/watchers.json",
      values: { open: false }
    });
  };

  const saveWatcher = (formData: Omit<Watcher, 'id' | 'createdAt' | 'updatedAt' | 'modeDisplayName'>) => {
    const selectedModeConfig = availableModes.find(mode => mode.slug === formData.mode);
    const modeDisplayName = selectedModeConfig?.name || formData.mode;
    
    vscode.postMessage({
      type: isEditing ? "updateWatcher" : "addWatcher", // Dedicated message types
      watcherId: (isEditing && selectedWatcherId) ? selectedWatcherId : undefined,
      data: { ...formData, modeDisplayName },
    });
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

  const deleteWatcher = (watcherIdToDelete: string) => { // Renamed parameter to avoid conflict
    vscode.postMessage({
      type: "deleteWatcher",
      watcherId: watcherIdToDelete, // Changed id to watcherId
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
    setActiveTab("edit");
  };
  
  const toggleWatcherActiveState = (watcherIdToToggle: string, currentActiveState: boolean | undefined) => { // Renamed parameter
    vscode.postMessage({
        type: "toggleWatcherActive",
        watcherId: watcherIdToToggle, // Changed id to watcherId
        active: !(currentActiveState !== false), // if undefined or true, set to false. if false, set to true.
    });
  };

  return (
    <div className="h-full flex flex-col"> {/* Replaced Tab with a div */}
      {/* Header-like section for buttons, moved inside */}
      <div className="flex justify-end items-center p-1 border-b border-vscode-panel-border mb-2">
        {activeTab === "edit" ? (
          <div className="flex gap-2">
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
        ) : (
          <Button size="sm" onClick={createNewWatcher}>Add Watcher</Button>
        )}
      </div>
      
      {/* Inner Tabs for list/edit form */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col flex-grow">
        <TabsContent value="watchers" className="space-y-2 flex-1 overflow-auto">
            {watchers.length === 0 ? (
              <div className="text-center py-8 text-vscode-descriptionForeground">
                No watchers configured. Create your first watcher.
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <WatcherList
                  watchers={watchers}
                  onEdit={editWatcher}
                  onDelete={(id) => {
                    setWatcherToDelete(id);
                    setDialogOpen(true);
                  }}
                  onDuplicate={(watcherId) => {
                    vscode.postMessage({
                      type: "duplicateWatcher",
                      watcherId: watcherId,
                    });
                    // The webview message handler will update the file and trigger a refresh
                  }}
                  onToggleActive={toggleWatcherActiveState}
                  onResumeTask={(taskId) => vscode.postMessage({ type: "resumeTask", taskId })}
                  formatDate={formatDate}
                />
              </div>
            )}
          </TabsContent>
          <TabsContent value="edit" className="mt-4">
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
