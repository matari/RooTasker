export interface Watcher {
  id: string;
  name: string;
  directoryPath: string;
  fileTypes: string[]; // e.g., ["*.ts", "*.js"] or specific extensions like [".txt", ".md"]
  prompt: string;
  mode: string;
  modeDisplayName?: string;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredTime?: string;
  lastTaskId?: string;
}

export interface WatchersFile {
  watchers: Watcher[];
}
