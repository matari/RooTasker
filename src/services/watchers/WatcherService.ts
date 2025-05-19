import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspacePath } from '../../utils/path';
import { fileExistsAtPath } from '../../utils/fs';
import { RooService } from '../scheduler/RooService'; // Corrected path
import { Watcher, WatchersFile } from '../../../webview-ui/src/components/watchers/types'; // Corrected path

export class WatcherService {
  private static instance: WatcherService;
  private watchers: Watcher[] = [];
  private watchersFilePath: string;
  private outputChannel: vscode.OutputChannel;
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();

  private constructor(private context: vscode.ExtensionContext) {
    this.watchersFilePath = path.join(getWorkspacePath(), '.rootasker', 'watchers.json');
    this.outputChannel = vscode.window.createOutputChannel('RooTasker Watchers');
    context.subscriptions.push(this.outputChannel);
  }

  public static getInstance(context: vscode.ExtensionContext): WatcherService {
    if (!WatcherService.instance) {
      WatcherService.instance = new WatcherService(context);
    }
    return WatcherService.instance;
  }

  public async initialize(): Promise<void> {
    this.log('Initializing WatcherService...');
    await this.loadWatchers();
    this.setupAllFileWatchers();
  }

  private async loadWatchers(): Promise<void> {
    try {
      const exists = await fileExistsAtPath(this.watchersFilePath);
      if (!exists) {
        const dirPath = path.dirname(this.watchersFilePath);
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (mkdirError) {
            this.log(`Error creating directory ${dirPath}: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`);
        }
        this.log(`Watchers file not found at ${this.watchersFilePath}, creating an empty one.`);
        this.watchers = [];
        await this.saveWatchers();
        return;
      }
      const content = await fs.readFile(this.watchersFilePath, 'utf-8');
      const data = JSON.parse(content) as WatchersFile;
      this.watchers = data.watchers || [];
      this.log(`Loaded ${this.watchers.length} watchers from ${this.watchersFilePath}`);
    } catch (error) {
      this.log(`Error loading watchers: ${error instanceof Error ? error.message : String(error)}`);
      this.watchers = [];
    }
  }

  private async saveWatchers(): Promise<void> {
    try {
      const dirPath = path.dirname(this.watchersFilePath);
      if (!await fileExistsAtPath(dirPath)) {
          await fs.mkdir(dirPath, { recursive: true });
      }
      const content = JSON.stringify({ watchers: this.watchers }, null, 2);
      await fs.writeFile(this.watchersFilePath, content, 'utf-8');
      this.log('Watchers saved successfully.');
      // Notify webview if needed, similar to schedulesUpdated
      // vscode.commands.executeCommand('rootasker.watchersUpdated'); 
    } catch (error) {
      this.log(`Error saving watchers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public getWatchers(): Watcher[] {
    return [...this.watchers];
  }

  public async addWatcher(watcherData: Omit<Watcher, 'id' | 'createdAt' | 'updatedAt'>): Promise<Watcher | undefined> {
    const newWatcher: Watcher = {
      ...watcherData,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: watcherData.active !== undefined ? watcherData.active : true,
    };
    this.watchers.push(newWatcher);
    await this.saveWatchers();
    if (newWatcher.active) {
      this.setupFileWatcher(newWatcher);
    }
    this.log(`Added new watcher: "${newWatcher.name}"`);
    return newWatcher;
  }

  public async duplicateWatcher(watcherId: string): Promise<Watcher | undefined> {
    const sourceWatcher = this.watchers.find(w => w.id === watcherId);
    if (!sourceWatcher) {
      this.log(`Watcher with ID ${watcherId} not found for duplication.`);
      return undefined;
    }

    const now = new Date().toISOString();
    const newWatcher: Watcher = {
      ...JSON.parse(JSON.stringify(sourceWatcher)), // Deep clone to avoid reference issues
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), // New unique ID
      name: `${sourceWatcher.name} - Copy`,
      active: false, // Start as inactive by default
      createdAt: now,
      updatedAt: now,
      lastTriggeredTime: undefined, // Reset execution history
      lastTaskId: undefined,
    };

    this.watchers.push(newWatcher);
    await this.saveWatchers();
    
    this.log(`Duplicated watcher "${sourceWatcher.name}" to "${newWatcher.name}"`);
    
    return newWatcher;
  }

  public async updateWatcher(watcherId: string, updates: Partial<Omit<Watcher, 'id' | 'createdAt'>>): Promise<Watcher | undefined> {
    const watcherIndex = this.watchers.findIndex(w => w.id === watcherId);
    if (watcherIndex === -1) {
      this.log(`Watcher with ID ${watcherId} not found for update.`);
      return undefined;
    }
    const oldWatcher = this.watchers[watcherIndex];
    const updatedWatcher = { ...oldWatcher, ...updates, updatedAt: new Date().toISOString() };
    this.watchers[watcherIndex] = updatedWatcher;
    await this.saveWatchers();

    // If active state changed or path/fileTypes changed, reset the watcher
    if (oldWatcher.active !== updatedWatcher.active || oldWatcher.directoryPath !== updatedWatcher.directoryPath || JSON.stringify(oldWatcher.fileTypes) !== JSON.stringify(updatedWatcher.fileTypes)) {
      this.removeFileWatcher(watcherId);
      if (updatedWatcher.active) {
        this.setupFileWatcher(updatedWatcher);
      }
    }
    this.log(`Updated watcher: "${updatedWatcher.name}"`);
    return updatedWatcher;
  }

  public async deleteWatcher(watcherId: string): Promise<void> {
    const initialLength = this.watchers.length;
    this.watchers = this.watchers.filter(w => w.id !== watcherId);
    if (this.watchers.length < initialLength) {
      await this.saveWatchers();
      this.removeFileWatcher(watcherId);
      this.log(`Deleted watcher with ID ${watcherId}`);
    } else {
      this.log(`Watcher with ID ${watcherId} not found for deletion.`);
    }
  }
  
  public async toggleWatcherActive(watcherId: string, active: boolean): Promise<Watcher | undefined> {
    const watcher = this.watchers.find(w => w.id === watcherId);
    if (!watcher) {
      this.log(`Watcher with ID ${watcherId} not found for toggle.`);
      return undefined;
    }
    if (watcher.active === active) {
        this.log(`Watcher "${watcher.name}" is already ${active ? 'active' : 'inactive'}.`);
        return watcher;
    }
    return this.updateWatcher(watcherId, { active });
  }

  private setupAllFileWatchers(): void {
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers.clear();
    this.watchers.forEach(watcher => {
      if (watcher.active) {
        this.setupFileWatcher(watcher);
      }
    });
  }

  private setupFileWatcher(watcher: Watcher): void {
    if (!watcher.active || !watcher.directoryPath || watcher.fileTypes.length === 0) {
      return;
    }
    if (this.fileWatchers.has(watcher.id)) {
        this.removeFileWatcher(watcher.id); // Remove existing if any
    }

    // Create a glob pattern. For multiple fileTypes, VS Code watcher might need separate watchers or a complex glob.
    // For simplicity, we'll join them if it's simple extensions, or use the first if it's a glob.
    // A more robust solution might involve creating multiple watchers if `fileTypes` contains multiple distinct globs.
    const globPattern = watcher.fileTypes.map(ft => path.join(watcher.directoryPath, ft)).join(','); 
    // Example: if fileTypes is ["*.ts", "*.js"], globPattern becomes "{/path/to/dir/*.ts,/path/to/dir/*.js}"
    // vscode.workspace.createFileSystemWatcher expects a single glob string.
    // A common way is to use a pattern like `**/${watcher.fileTypes.join(',')}` if fileTypes are simple extensions.
    // Or if fileTypes are already globs like `*.txt`, then `path.join(watcher.directoryPath, watcher.fileTypes[0])`
    // For now, let's assume fileTypes are like `*.ts` or `data.json`.
    // We'll create one watcher per fileType entry for simplicity and robustness.

    watcher.fileTypes.forEach(fileTypePattern => {
        const singleGlob = path.join(watcher.directoryPath, fileTypePattern);
        const fsWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watcher.directoryPath, fileTypePattern));
        this.log(`Setting up watcher for "${watcher.name}" on pattern: ${singleGlob}`);

        const handleChange = async (uri: vscode.Uri) => {
            this.log(`File change detected for watcher "${watcher.name}": ${uri.fsPath}`);
            try {
              const taskId = await RooService.startTaskWithMode(watcher.mode, watcher.prompt);
              this.log(`Triggered task ${taskId} for watcher "${watcher.name}" due to change in ${uri.fsPath}`);
              // Update watcher's last triggered time and task ID
              const now = new Date().toISOString();
              await this.updateWatcher(watcher.id, { lastTriggeredTime: now, lastTaskId: taskId });
            } catch (error) {
              this.log(`Error triggering task for watcher "${watcher.name}": ${error instanceof Error ? error.message : String(error)}`);
            }
          };

        fsWatcher.onDidChange(handleChange);
        fsWatcher.onDidCreate(handleChange);
        // fsWatcher.onDidDelete(uri => { /* Decide if delete should trigger */ });

        this.context.subscriptions.push(fsWatcher);
        // Store watcher with a compound key if multiple watchers per Watcher object
        this.fileWatchers.set(`${watcher.id}-${fileTypePattern}`, fsWatcher);
    });
  }

  private removeFileWatcher(watcherId: string): void {
    // Iterate over map entries to find all watchers associated with this watcherId
    for (const [key, fsWatcher] of this.fileWatchers.entries()) {
        if (key.startsWith(watcherId + "-")) {
            fsWatcher.dispose();
            this.fileWatchers.delete(key);
            this.log(`Removed file watcher for ID part: ${key}`);
        }
    }
  }

  public dispose(): void {
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers.clear();
    this.log('WatcherService disposed, all file watchers stopped.');
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
