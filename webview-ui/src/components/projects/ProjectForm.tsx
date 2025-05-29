import React, { useState, useEffect } from 'react';
import type { Project } from '../../../../src/shared/ProjectTypes';
import { Button } from '../ui/button';
import Checkbox from '../ui/checkbox'; // Default import
// Removed Label import as it's not available and native label is used
import { vscode } from '../../utils/vscode'; // Added import
import { useEvent } from 'react-use'; // Added import
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
// Removed Label import: import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';

interface ProjectFormData {
  name: string;
  description: string;
  directoryPath: string;
  color: string;
  watchInputDirEnabled: boolean;
}

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null; // Project data for editing, null/undefined for new
  onSave: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> | Project) => void;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ isOpen, onClose, project, onSave }) => {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    directoryPath: '',
    color: '#4A90E2', // Default color
    watchInputDirEnabled: false,
  });

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name,
        description: project.description,
        directoryPath: project.directoryPath,
        color: project.color,
        watchInputDirEnabled: project.watchInputDirEnabled ?? false,
      });
    } else {
      // Reset for new project form
      setFormData({
        name: '',
        description: '',
        directoryPath: '',
        color: '#4A90E2',
        watchInputDirEnabled: false,
      });
    }
  }, [project, isOpen]); // Depend on isOpen to reset form when re-opened for new

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, color: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (project) {
      // Editing existing project
      onSave({ ...project, ...formData });
    } else {
      // Creating new project
      onSave(formData);
    }
  };

  // Removed duplicate handleSubmit

  const handleBrowseDirectory = () => {
    vscode.postMessage({ type: 'selectProjectDirectory' });
  };

  useEvent('message', (event: MessageEvent) => {
    const message = event.data;
    if (message.type === 'projectDirectorySelected' && message.path) {
      setFormData((prev) => ({ ...prev, directoryPath: message.path }));
    }
  });

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]"> {/* Increased width slightly */}
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Create New Project'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-vscode-settings-headerForeground">Project Name <span className="text-red-500">*</span></label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-vscode-settings-headerForeground">Description</label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <label htmlFor="directoryPath" className="block text-sm font-medium text-vscode-settings-headerForeground">Directory Path <span className="text-red-500">*</span></label>
            <div className="flex items-center space-x-2 mt-1">
              <Input
                id="directoryPath"
                name="directoryPath"
                value={formData.directoryPath}
                onChange={handleChange}
                placeholder="/path/to/project/folder"
                required
                className="flex-grow"
              />
              <Button type="button" variant="outline" onClick={handleBrowseDirectory} size="sm">Browse...</Button>
            </div>
          </div>
          <div>
            <label htmlFor="color" className="block text-sm font-medium text-vscode-settings-headerForeground">Project Color</label>
            <div className="flex items-center mt-1">
              <Input
                id="color"
                name="color"
                type="color" // HTML5 color picker
                value={formData.color}
                onChange={handleColorChange}
                className="w-12 h-10 p-1"
              />
              <Input
                type="text"
                value={formData.color}
                onChange={handleColorChange}
                className="ml-2 flex-grow"
                placeholder="#RRGGBB"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="watchInputDirEnabled"
              checked={formData.watchInputDirEnabled}
              onChange={(checked: boolean) => // Explicitly type 'checked'
                setFormData((prev) => ({
                  ...prev,
                  watchInputDirEnabled: checked,
                }))
              }
            />
            <label // Use native label element
              htmlFor="watchInputDirEnabled"
              className="text-sm font-medium text-vscode-settings-headerForeground cursor-pointer"
            >
              Automatically watch project input directory
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">{project ? 'Save Changes' : 'Create Project'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectForm;
