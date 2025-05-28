import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { NavigationPayload } from '../../types';
import PromptForm, { PromptFormData, PromptFormHandle } from './PromptForm';
import PromptListItem from './PromptListItem';
import { Button } from '@/components/ui/button';
import { vscode } from '../../utils/vscode';
import { useExtensionState } from '../../context/ExtensionStateContext';
import { Prompt } from '../../../../src/shared/ProjectTypes';


interface PromptsViewProps {
  initialAction?: NavigationPayload | null;
  onInitialActionConsumed?: () => void;
}

const PromptsView: React.FC<PromptsViewProps> = ({ initialAction, onInitialActionConsumed }) => {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [currentPromptData, setCurrentPromptData] = useState<Partial<PromptFormData> | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const promptFormRef = useRef<PromptFormHandle>(null);
  const [isFormValid, setIsFormValid] = useState(false);

  const { prompts } = useExtensionState(); 

  const stableEmptyPrompt = useMemo(() => ({ title: '', description: '', content: '', tags: [] }), []);

  useEffect(() => {
    if (initialAction?.view === 'form' && onInitialActionConsumed) {
      setCurrentPromptData(stableEmptyPrompt); 
      setIsEditingMode(false);
      setViewMode('form');
      onInitialActionConsumed();
    }
    // TODO: Handle initialAction.itemId for editing a specific prompt
  }, [initialAction, onInitialActionConsumed, stableEmptyPrompt]);

  const handleCreateNewPrompt = () => {
    setCurrentPromptData(stableEmptyPrompt);
    setIsEditingMode(false);
    setViewMode('form');
  };

  const handleEditPrompt = (prompt: Prompt) => {
    setCurrentPromptData({ 
      title: prompt.title, 
      content: prompt.content,
      description: '', // Description is not stored in Prompt type, just for UI
      tags: prompt.tags || [] 
    });
    setEditingPromptId(prompt.id);
    setIsEditingMode(true);
    setViewMode('form');
  };


  const handleSavePrompt = (formData: PromptFormData) => {
    console.log('Saving prompt:', formData);
    // Send message to backend to create/update prompt
    // The backend will then open the file in the editor
    vscode.postMessage({
      type: 'savePromptAndOpenFile', 
      payload: {
        ...formData,
        promptId: isEditingMode && editingPromptId ? editingPromptId : undefined,
      },
    });
    setViewMode('list'); 
    setEditingPromptId(null);
  };

  const handleRunPromptNow = (promptId: string) => {
    // TODO: Potentially allow selecting a mode or use a default/current mode
    console.log(`Running prompt now: ${promptId}`);
    vscode.postMessage({
      type: 'runPromptNow', // New message type
      payload: { promptId },
    });
    // Typically, running a prompt doesn't change the view here, it starts a task in Roo Code.
  };

  const handleCancelForm = () => {
    setCurrentPromptData(null);
    setEditingPromptId(null);
    setIsEditingMode(false);
    setViewMode('list');
  };

  // Date formatting function
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  // TODO: Implement these handlers
  const handleDuplicatePrompt = (promptId: string) => {
    console.log('Duplicate prompt:', promptId);
    // TODO: Send message to backend to duplicate prompt
  };

  const handleArchivePrompt = (promptId: string) => {
    console.log('Archive prompt:', promptId);
    // TODO: Send message to backend to archive/unarchive prompt
  };

  const handleDeletePrompt = (promptId: string) => {
    console.log('Delete prompt:', promptId);
    vscode.postMessage({
      type: 'deletePrompt',
      payload: { promptId },
    });
  };

  if (viewMode === 'form') {
    return (
      <div className="p-4 h-full flex flex-col">
        <PromptForm
          ref={promptFormRef}
          initialData={currentPromptData || stableEmptyPrompt}
          isEditing={isEditingMode}
          onSave={handleSavePrompt}
          onCancel={handleCancelForm}
          onValidityChange={setIsFormValid}
        />
        <div className="flex justify-end gap-2 mt-4 p-1 border-t border-vscode-panel-border">
          <Button variant="secondary" size="sm" onClick={handleCancelForm}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => promptFormRef.current?.submitForm()}
            disabled={!isFormValid}
          >
            {isEditingMode ? 'Update & Open' : 'Save & Open'}
          </Button>
        </div>
      </div>
    );
  }

  // List View (Placeholder)
  return (
    <div className="p-4 h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-vscode-foreground">Prompts Management</h2>
        {/* The global "+" button in App.tsx handles navigation to form mode via initialAction */}
      </div>
      {(!prompts || prompts.length === 0) ? (
        <div className="text-center py-8 text-vscode-descriptionForeground">
          No prompts created yet. Click the "+" button in the header to add your first prompt.
        </div>
      ) : (
        <div className="overflow-y-auto">
          {prompts.map(prompt => (
            <PromptListItem
              key={prompt.id}
              prompt={prompt}
              onEdit={handleEditPrompt}
              onRunNow={handleRunPromptNow}
              onDuplicate={handleDuplicatePrompt}
              onArchive={handleArchivePrompt}
              onDelete={handleDeletePrompt}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
      {/* Example button to test edit flow (remove later if list items have edit buttons) */}
      {/* <Button onClick={() => handleEditPrompt({id: 'test-id', title: 'Test Prompt', content: '', createdAt: '', updatedAt: '', isArchived: false, tags: ['test']})}>
        Test Edit
      </Button> */}
    </div>
  );
};

export default PromptsView;
