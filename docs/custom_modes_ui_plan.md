# Plan: Add Custom Mode Management UI

This document outlines the plan to implement a user interface for managing custom modes within the RooPlus extension.

## Phase 1: Design the UI Components (with Consistent Styling)

1.  **Custom Modes View (`CustomModesView.tsx`):**
    *   Create the main view component.
    *   Layout will follow patterns of existing views (e.g., `ProjectsView.tsx`).
    *   Include a header area.
    *   Implement a `FilterInput` component for searching modes, placed on its own line.
    *   Include a list area to display custom modes.
    *   Add a button to "Create New Custom Mode".
    *   Use consistent padding and spacing utilities (e.g., `p-4`, `space-y-*`).

2.  **Mode List Item (`ModeListItem.tsx`):**
    *   Develop a component to display individual custom modes.
    *   Style similarly to `ProjectCard.tsx` or `PromptListItem.tsx`, using `border` and `rounded-lg` classes, and consistent padding (e.g., `p-3`).
    *   Clearly display:
        *   Mode Name
        *   Mode Slug
        *   Source (Global/Project)
        *   Description (if provided)
    *   Include action buttons (Edit, Duplicate, Delete) styled like the small ghost buttons in `ProjectCard.tsx`.

3.  **Custom Mode Form (`CustomModeForm.tsx`):**
    *   Create a form for creating new modes or editing existing ones.
    *   Use existing UI library components (`Input`, `Textarea`, `Button`, `Select`, `Checkbox`) and follow styling conventions of forms like `ProjectForm.tsx`.
    *   **Fields:**
        *   **Mode Slug** (string, required, unique identifier)
        *   **Mode Name** (string, required, display name)
        *   **Description** (string, optional)
        *   **System Prompt / Role Definition** (string, required, using `AutosizeTextarea`)
        *   **Source** (Global/Project): Option to choose if creating in a workspace context.
        *   **Available Tools Section (Permissions / `groups`):**
            *   Checkboxes for:
                *   "Read Files" (`read`)
                *   "Edit Files" (`edit`)
                *   "Use Browser" (`browser`)
                *   "Run Commands" (`command`)
                *   "Use MCP" (`mcp`)
                *   "Manage Modes" (`modes`)
            *   For "Read Files" and "Edit Files", include an optional text input (conditionally shown) for a `fileRegex` pattern.
    *   Map the form state for tool permissions to the `groups` array in the mode configuration.

4.  **Confirmation Dialogs:**
    *   Utilize the existing `ConfirmationDialog` component for delete actions, ensuring consistent styling.

## Phase 2: Implement Frontend Logic (Message Handling & State)

1.  **State Management:**
    *   Update `ExtensionStateContext.tsx` to manage:
        *   The list of `customModes` (already present, ensure it's correctly populated and used).
        *   State for the custom mode form (e.g., `editingModeId`, `initialModeFormData`).
        *   Current view within the custom modes tab (list vs. form).
2.  **Message Handling (`webviewMessageHandler.ts`):**
    *   Implement/verify handlers for messages from the webview:
        *   `getCustomModes`: Fetches the list of modes from `CustomModesManager.ts`.
        *   `saveCustomMode`: Creates or updates a mode by calling `CustomModesManager.updateCustomMode`. The payload must correctly format the `groups` array (e.g., `["read", ["edit", { "fileRegex": "*.ts" }]]`).
        *   `deleteCustomMode`: Deletes a mode by calling `CustomModesManager.deleteCustomMode`.
3.  **Data Flow:**
    *   Connect the new UI components to the extension state and message handlers for fetching, displaying, and modifying custom modes.

## Phase 3: Integrate into Webview

1.  **Navigation:**
    *   Add a new main tab labeled "Custom Modes" (or similar) in `App.tsx` to provide access to the `CustomModesView.tsx`.

## Phase 4: Roo Code Mode Fields (Review Completed)

The relevant fields from `RooCodeSettings['customModes']` (defined in `src/roo-code.d.ts`) that the `CustomModeForm.tsx` needs to capture are:

*   **`slug`** (string, required): Unique identifier.
*   **`name`** (string, required): Display name.
*   **`roleDefinition`** (string, required): The core system prompt or persona definition.
*   **`customInstructions`** (string, optional): Additional behavioral guidelines.
*   **`groups`** (array, required): Defines tool permissions.
    *   Each element can be a string (e.g., `"browser"`, `"command"`, `"mcp"`, `"modes"`).
    *   For file operations, it can be a tuple: `["read", { fileRegex?: "pattern" }]` or `["edit", { fileRegex?: "pattern" }]`.
*   **`source`** ("global" | "project", optional): This is determined by where the mode is being saved (global `custom_modes.json` or project `.roomodes` file) rather than being a direct form field for the user to pick during creation of a *specific* mode's properties. The UI should allow creating/editing in either global or project scope if applicable.

This plan provides a comprehensive approach to adding a UI for managing custom modes, ensuring consistency with the existing application design and correctly interfacing with the backend logic.
