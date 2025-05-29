import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'; // Added useCallback
import { useEvent } from 'react-use'; // Added useEvent
import type { NavigationPayload } from '../../types';
import PromptForm, { PromptFormData, PromptFormHandle } from './PromptForm';
import PromptListItem from './PromptListItem';
import { Button } from '@/components/ui/button';
import { vscode } from '../../utils/vscode';
import { useExtensionState } from '../../context/ExtensionStateContext';
import { Prompt } from '../../../../src/shared/ProjectTypes';
import SplashPage from '../common/SplashPage';
import FilterInput from '../common/FilterInput'; // Added FilterInput


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
  const [filterText, setFilterText] = useState(''); // Added filter text state

  const filteredPrompts = useMemo(() => {
    if (!prompts) return [];
    if (!filterText.trim()) return prompts;
    const lowerFilterText = filterText.toLowerCase();
    return prompts.filter(prompt => 
      prompt.title.toLowerCase().includes(lowerFilterText) ||
      (prompt.content && prompt.content.toLowerCase().includes(lowerFilterText)) ||
      (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(lowerFilterText)))
    );
  }, [prompts, filterText]);

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

  // Listen for messages from the extension to populate form with full content
  const handleExtensionMessages = useCallback((event: MessageEvent) => {
    const message = event.data; // Type should be ExtensionMessage
    if (message.type === 'setEditingPromptWithContent' && message.payload) {
      const fullPrompt = message.payload as Prompt;
      if (editingPromptId === fullPrompt.id) { // Ensure it's for the current editing session
        setCurrentPromptData({
          title: fullPrompt.title,
          description: fullPrompt.description || '',
          content: fullPrompt.content || '', // Content from backend
          tags: fullPrompt.tags || [],
        });
      }
    }
  }, [editingPromptId]);

  useEvent('message', handleExtensionMessages);

  const handleCreateNewPrompt = () => {
    setCurrentPromptData(stableEmptyPrompt);
    setIsEditingMode(false);
    setViewMode('form');
  };

  const handleEditPrompt = async (promptMeta: Omit<Prompt, 'content'>) => { // Takes metadata
    // Fetch full prompt content when starting an edit
    vscode.postMessage({ type: 'getPromptContent', payload: { promptId: promptMeta.id }});
    // A new message 'setEditingPromptWithContent' will be sent back from extension
    // For now, we can optimistically set metadata and wait for content, or show loading.
    // Let's set metadata and an empty content, which will be filled by 'setEditingPromptWithContent'.
    setCurrentPromptData({ 
      title: promptMeta.title, 
      description: promptMeta.description || '',
      content: '', // Will be filled by a subsequent message
      tags: promptMeta.tags || [] 
    });
    setEditingPromptId(promptMeta.id);
    setIsEditingMode(true);
    setViewMode('form');
  };


  const handleSaveMetadata = (formData: PromptFormData) => {
    console.log('Saving prompt metadata:', formData);
    vscode.postMessage({
      type: isEditingMode && editingPromptId ? 'updatePromptMetadata' : 'createPromptWithMetadata',
      payload: {
        ...formData,
        promptId: isEditingMode && editingPromptId ? editingPromptId : undefined,
      },
    });
    // If creating new, we might want to stay on the form or switch to list.
    // For now, let's switch to list and clear editing state.
    // The backend should respond with the new/updated prompt to refresh the list.
    setViewMode('list'); 
    setEditingPromptId(null);
    // setCurrentPromptData(null); // Keep form data if user wants to edit content next
  };

  const handleEditContentFile = () => {
    if (!editingPromptId) return;
    // Ensure latest metadata from form is saved before opening content file
    // This could be done by calling submitForm or by sending current form data
    if (promptFormRef.current) {
      const currentFormData = promptFormRef.current.getFormData(); // Assuming getFormData exists
       vscode.postMessage({
        type: 'updatePromptMetadata', // Save metadata first
        payload: { ...currentFormData, promptId: editingPromptId },
      });
    }
    vscode.postMessage({
      type: 'openPromptContentFile',
      payload: { promptId: editingPromptId },
    });
  };

  const handleRequestPromptImprovement = () => {
    if (!editingPromptId) return;
     if (promptFormRef.current) {
      const currentFormData = promptFormRef.current.getFormData(); 
       vscode.postMessage({
        type: 'updatePromptMetadata', 
        payload: { ...currentFormData, promptId: editingPromptId },
      });
    }
    vscode.postMessage({
      type: 'requestPromptImprovement',
      payload: { promptId: editingPromptId },
    });
    // UI could show "Improvement in progress..."
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
          onSave={handleSaveMetadata} // Changed from handleSavePrompt
          onCancel={handleCancelForm}
          onValidityChange={setIsFormValid}
        />
        <div className="flex justify-end gap-2 mt-4 p-1 border-t border-vscode-panel-border">
          <Button variant="secondary" size="sm" onClick={handleCancelForm}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => promptFormRef.current?.submitForm()} // This will call handleSaveMetadata
            disabled={!isFormValid}
          >
            {isEditingMode ? 'Save Metadata' : 'Create Prompt'}
          </Button>
          {isEditingMode && editingPromptId && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEditContentFile}
                disabled={!isFormValid} // Or just !editingPromptId
                title="Save metadata and open content file for editing"
              >
                Edit Content
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestPromptImprovement}
                disabled={!isFormValid} // Or just !editingPromptId
                title="Save metadata and request AI to improve prompt content"
              >
                Improve Prompt
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="p-4 h-full">
      <div className="flex justify-end items-center mb-4"> {/* Changed justify-between to justify-end and removed h2 */}
        <FilterInput 
          value={filterText}
          onValueChange={setFilterText}
          placeholder="Filter prompts..."
          className="w-full max-w-md mb-4" // Changed width, kept mb-4
        />
      </div>
      {/* The mb-4 on FilterInput will create space before the next element,
          so the conditional rendering below should naturally have space.
          If the list itself needs more specific top margin, it can be added to its container.
      */}
      {(!filteredPrompts || filteredPrompts.length === 0) ? (
        (filterText.trim() && (!prompts || prompts.length > 0)) ? (
          <div className="text-center py-8 text-vscode-descriptionForeground">
            No prompts match your filter.
          </div>
        ) : (
          <SplashPage tabType="prompts" /> 
        )
      ) : (
        <div className="overflow-y-auto">
          {filteredPrompts.map(prompt => (
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
