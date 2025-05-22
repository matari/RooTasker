# Tabbed Header Implementation Plan

## Overview

This document outlines the changes required to implement the tabbed header design with the following requirements:
1. Replace the "RooTasker" header with a tabbed header showing "Projects", "Scheduled Tasks", and "Watchers"
2. Each tab should have a "+" button to add a new project, task, or watcher
3. Change the active tab styling to use a blue icon with a blue line underneath (instead of a colored background)

## Implementation Details

### 1. Modify App.tsx

The main changes will be in the App.tsx file, specifically in the header section:

```tsx
{/* Header Section - BEFORE */}
<div className="flex justify-between items-center p-2 border-b border-vscode-panel-border">
    {/* Title on the far left */}
    <h2 className="text-lg font-medium text-vscode-foreground">RooTasker</h2>

    {/* Action buttons in the middle */}
    <div className="flex items-center gap-2">
        {activeMainTab === 'projects' && (
            <Button size="sm" onClick={handleToggleNewProjectModal} title="New Project">
                <span className="codicon codicon-add mr-1"></span>
                New Project
            </Button>
        )}
        {/* ...other buttons */}
    </div>

    {/* Icon-based navigation tabs on the far right */}
    <TabsList className="flex gap-1">
        <TabsTrigger value="projects" className="p-1 bg-transparent border-none rounded-sm text-vscode-icon-foreground hover:bg-vscode-toolbar-hoverBackground data-[state=active]:bg-vscode-toolbar-activeBackground data-[state=active]:text-vscode-icon-foreground" title="Projects">
            <span className="codicon codicon-project" style={{ fontSize: '16px' }}></span>
        </TabsTrigger>
        {/* ...other tabs */}
    </TabsList>
</div>
```

```tsx
{/* Header Section - AFTER */}
<div className="flex justify-between items-center p-2 border-b border-vscode-panel-border">
    {/* Tabbed navigation on the left */}
    <TabsList className="flex gap-4">
        <TabsTrigger 
            value="projects" 
            className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger" 
            title="Projects">
            <span className="codicon codicon-project"></span>
            <span>Projects</span>
        </TabsTrigger>
        <TabsTrigger 
            value="scheduler" 
            className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger" 
            title="Scheduled Tasks">
            <span className="codicon codicon-calendar"></span>
            <span>Scheduled Tasks</span>
        </TabsTrigger>
        <TabsTrigger 
            value="watchers" 
            className="flex items-center gap-1 px-2 py-1 bg-transparent border-none rounded-none text-vscode-icon-foreground hover:text-vscode-button-background custom-tab-trigger" 
            title="Watchers">
            <span className="codicon codicon-eye"></span>
            <span>Watchers</span>
        </TabsTrigger>
    </TabsList>

    {/* Action buttons on the right */}
    <div className="flex items-center gap-2">
        {activeMainTab === 'projects' && (
            <Button size="sm" variant="ghost" onClick={handleToggleNewProjectModal} title="New Project">
                <span className="codicon codicon-add"></span>
            </Button>
        )}
        {activeMainTab === 'scheduler' && (
            <Button size="sm" variant="ghost" onClick={() => handleNavigateToTab('scheduler', { view: 'form' })} title="New Task">
                <span className="codicon codicon-add"></span>
            </Button>
        )}
        {activeMainTab === 'watchers' && (
            <Button size="sm" variant="ghost" onClick={() => handleNavigateToTab('watchers', { view: 'form' })} title="New Watcher">
                <span className="codicon codicon-add"></span>
            </Button>
        )}
    </div>
</div>
```

### 2. Add Custom CSS for Tab Styling

Create a new CSS class in `webview-ui/src/index.css` to handle the custom tab styling:

```css
/* Add at the end of the file */
@layer components {
  /* Custom tab styling */
  .custom-tab-trigger {
    position: relative;
    transition: all 0.2s ease-in-out;
  }

  .custom-tab-trigger[data-state="active"] {
    background-color: transparent !important;
    color: var(--vscode-button-background) !important;
  }

  .custom-tab-trigger[data-state="active"]::after {
    content: "";
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 100%;
    height: 2px;
    background-color: var(--vscode-button-background);
  }

  .custom-tab-trigger[data-state="active"] .codicon {
    color: var(--vscode-button-background);
  }
}
```

### 3. Modify the TabsTrigger Component Styling (Optional)

If you want to keep the underlying TabsTrigger component as is and just override the active state, you can modify the `tabs.tsx` file:

```tsx
// In TabsTrigger component (around line 44-48)
// BEFORE:
className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
    isActive
        ? "bg-vscode-button-background text-vscode-button-foreground"
        : "text-vscode-foreground hover:bg-vscode-dropdown-background/80"
} ${className}`}

// AFTER:
className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
    isActive
        ? "custom-active-tab" // Use CSS class instead
        : "text-vscode-foreground hover:bg-vscode-dropdown-background/80"
} ${className}`}
```

## Design Preview

When implemented, the tabs will look like this:

- Inactive tab: Normal text color with icon and label
- Active tab: Blue icon and text with a blue underline below the tab
- Hover state: Slight blue tint to indicate interactivity

## Implementation Steps

1. Create the custom CSS classes in index.css
2. Update the App.tsx header structure to use text tabs with icons
3. Adjust the action button display logic
4. (Optional) Update tabs.tsx if you want to change the base component

## Notes

- The existing tab navigation functionality should work as is - we're just changing the UI presentation
- The "+" button changes based on the active tab to add the appropriate item type
- If watchers don't have an "add" functionality yet, you'll need to implement that
- You might want to adjust spacing and sizing to match your design preferences