// Migration script to copy data from RooTasker to RooPlus
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// Define the paths based on OS
const appDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : 
    path.join(os.homedir(), '.config'));

const vscodeStoragePath = path.join(appDataPath, 'Code', 'User', 'globalStorage');
const oldExtensionPath = path.join(vscodeStoragePath, 'kylehoskins.roo-tasker');
const newExtensionPath = path.join(vscodeStoragePath, 'mrmatari.rooplus');

console.log('Starting migration from RooTasker to RooPlus...');
console.log(`Old extension path: ${oldExtensionPath}`);
console.log(`New extension path: ${newExtensionPath}`);

// Check if the directories exist
if (!fs.existsSync(oldExtensionPath)) {
    console.error('Error: Old extension directory not found!');
    process.exit(1);
}

if (!fs.existsSync(newExtensionPath)) {
    console.error('Error: New extension directory not found!');
    process.exit(1);
}

// Function to copy a directory recursively
function copyDirRecursive(sourceDir, targetDir) {
    // Create the target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Read the contents of the source directory
    const items = fs.readdirSync(sourceDir, { withFileTypes: true });
    
    for (const item of items) {
        const sourcePath = path.join(sourceDir, item.name);
        const targetPath = path.join(targetDir, item.name);
        
        if (item.isDirectory()) {
            // Recursively copy subdirectories
            copyDirRecursive(sourcePath, targetPath);
        } else {
            // Copy files
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`Copied: ${sourcePath} -> ${targetPath}`);
        }
    }
}

// Copy settings directory
const oldSettingsPath = path.join(oldExtensionPath, 'settings');
const newSettingsPath = path.join(newExtensionPath, 'settings');
if (fs.existsSync(oldSettingsPath)) {
    copyDirRecursive(oldSettingsPath, newSettingsPath);
    console.log('Settings directory copied successfully');
}

// Copy prompts directory if it exists
const oldPromptsLibraryPath = path.join(oldExtensionPath, 'prompts_library');
const newPromptsLibraryPath = path.join(newExtensionPath, 'prompts_library');
if (fs.existsSync(oldPromptsLibraryPath)) {
    copyDirRecursive(oldPromptsLibraryPath, newPromptsLibraryPath);
    console.log('Prompts library directory copied successfully');

    // Copy prompts index file if it exists
    const oldPromptsIndexPath = path.join(oldExtensionPath, 'prompts_index.json');
    const newPromptsIndexPath = path.join(newExtensionPath, 'prompts_index.json');
    if (fs.existsSync(oldPromptsIndexPath)) {
        fs.copyFileSync(oldPromptsIndexPath, newPromptsIndexPath);
        console.log('Prompts index file copied successfully');
    }
}

// Migration complete message
console.log('\nMigration completed successfully!');
console.log('Please restart VS Code for the changes to take effect.');
