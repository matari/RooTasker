import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AutosizeTextarea } from '@/components/ui/autosize-textarea';
import { Badge } from '@/components/ui/badge';
import LabeledInput from '../scheduler/LabeledInput'; // Re-use LabeledInput if suitable
import { Prompt } from '../../../../src/shared/ProjectTypes';

// Ensure content is string for the form data, as getDefinedForm guarantees it.
export type PromptFormData = Omit<Pick<Prompt, 'title' | 'content' | 'tags' | 'description'>, 'content'> & { content: string };

interface PromptFormProps {
  initialData?: Partial<PromptFormData>;
  isEditing: boolean; // To adapt form for editing later
  onSave: (formData: PromptFormData) => void;
  onCancel: () => void;
  onValidityChange?: (isValid: boolean) => void;
}

export interface PromptFormHandle {
  submitForm: () => void;
  getFormData: () => PromptFormData; // Added to get current form data
}

const getDefinedForm = (initialData?: Partial<PromptFormData>): PromptFormData & { currentTagInput: string } => ({
  title: initialData?.title ?? '',
  description: initialData?.description ?? '',
  content: initialData?.content ?? '',
  tags: initialData?.tags ?? [],
  currentTagInput: '',
});

const PromptForm = forwardRef<PromptFormHandle, PromptFormProps>(
  ({ initialData, isEditing, onSave, onCancel, onValidityChange }, ref) => {
    const [form, setForm] = useState(getDefinedForm(initialData));

    const isValid = useMemo(() => {
      return !!form.title.trim() && !!form.content.trim(); // Title and content are mandatory
    }, [form.title, form.content]);

    useEffect(() => {
      if (onValidityChange) onValidityChange(isValid);
    }, [isValid, onValidityChange]);

    useEffect(() => {
      setForm(getDefinedForm(initialData));
    }, [initialData]);

    useImperativeHandle(ref, () => ({
      submitForm: () => handleSave(),
      getFormData: () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { currentTagInput, ...formDataToReturn } = form;
        return formDataToReturn;
      },
    }));

    const setField = <K extends keyof (PromptFormData & { currentTagInput: string })>(
      key: K,
      value: (PromptFormData & { currentTagInput: string })[K]
    ) => {
      setForm((f) => ({ ...f, [key]: value }));
    };

    const handleAddTag = () => {
      const newTag = form.currentTagInput.trim();
      if (newTag && !(form.tags || []).includes(newTag)) {
        setField('tags', [...(form.tags || []), newTag]);
      }
      setField('currentTagInput', ''); // Clear input
    };

    const handleRemoveTag = (tagToRemove: string) => {
      setField('tags', (form.tags || []).filter(tag => tag !== tagToRemove));
    };

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        handleAddTag();
      }
    };

    const handleSave = () => {
      if (!isValid) {
        console.error('Form is invalid');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { currentTagInput, ...formDataToSave } = form; 
      onSave(formDataToSave);
    };

    return (
      <div className="flex flex-col gap-5 p-1">
        <h4 className="text-vscode-foreground text-lg font-medium m-0">
          {isEditing ? 'Edit Prompt Details' : 'Create New Prompt'}
        </h4>
        <LabeledInput
          label="Title"
          required
          className="w-full"
          placeholder="Enter prompt title..."
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-vscode-descriptionForeground text-sm">
            Description (Optional)
          </label>
          <AutosizeTextarea
            className="w-full p-3 bg-vscode-input-background !bg-vscode-input-background border border-vscode-input-border"
            minHeight={60}
            maxHeight={150}
            placeholder="Enter a brief description for this prompt..."
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-vscode-descriptionForeground text-sm">
            Prompt Content <span className="text-red-500">*</span>
          </label>
          <AutosizeTextarea
            className="w-full p-3 bg-vscode-input-background !bg-vscode-input-background border border-vscode-input-border"
            minHeight={200}
            maxHeight={400}
            placeholder="Enter your prompt content here..."
            value={form.content}
            onChange={(e) => setField('content', e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
            <label className="text-vscode-descriptionForeground text-sm">
                Tags (Optional)
            </label>
            <div className="flex flex-wrap gap-2 mb-2 p-2 border border-vscode-input-border rounded-md min-h-[40px]">
                {(form.tags || []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <button
                            type="button"
                            className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            onClick={() => handleRemoveTag(tag)}
                            aria-label={`Remove ${tag}`}
                        >
                           <span className="codicon codicon-close text-xs"></span>
                        </button>
                    </Badge>
                ))}
            </div>
            <Input
                type="text"
                placeholder="Add a tag and press Enter or Comma"
                value={form.currentTagInput}
                onChange={(e) => setField('currentTagInput', e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={handleAddTag} 
                className="w-full"
            />
        </div>
        
        {/* Save/Cancel buttons will be handled by the parent PromptsView */}
      </div>
    );
  }
);

export default PromptForm;
