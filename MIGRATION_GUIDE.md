# RooTasker to Roo+ Migration Guide

This guide provides instructions for migrating your data from the RooTasker extension to the Roo+ extension.

## Step 1: File-based Data Migration

First, run the provided migration script to copy settings and prompt files:

```bash
node migrate-data.js
```

This script copies:
- Custom mode settings
- Prompt libraries
- Any other file-based storage

## Step 2: Project and Schedule Migration

For VS Code's database-stored information (projects, schedules, watchers), you'll need to:

1. Open VS Code with both extensions installed
2. Take note of your projects, schedules, and watchers in RooTasker
3. Recreate them in Roo+

### Projects Migration

For each project in RooTasker:
1. Note the project name, description, directory path, and color
2. Create a new project in Roo+ with the same information

### Schedules Migration

For each schedule:
1. Note the schedule details (name, task instructions, schedule type, etc.)
2. Create a new schedule in the corresponding Roo+ project

### Watchers Migration

For each watcher:
1. Note the watcher details (name, directory path, file types, prompt, etc.)
2. Create a new watcher in the corresponding Roo+ project

### Prompts Migration

Prompts should be automatically migrated when you run the `migrate-data.js` script if they're stored as files. If not:

1. Open each prompt in RooTasker
2. Create a new prompt in Roo+ with the same title, description, content, and tags

## Troubleshooting

If you encounter any issues during migration:

1. Ensure both extensions are installed and activated
2. Check the VS Code Developer Tools console for any error messages
3. Try restarting VS Code after running the migration script
4. If problems persist, you may need to manually recreate your projects, schedules, and watchers in Roo+

## Advanced Migration (For Developers)

If you're comfortable with TypeScript development, you can use the provided `src/utils/migrateFromRooTasker.ts` as a starting point for creating a more automated migration solution.

To use this script:
1. Add it to your extension's utility files
2. Import it in your extension.ts file
3. Call it during extension activation with your extension context

Note: This requires both extensions to be installed and may require additional debugging and error handling.
