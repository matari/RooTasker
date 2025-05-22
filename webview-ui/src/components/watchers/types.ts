import type { BaseWatcher } from "../../../../src/shared/ProjectTypes";

export interface Watcher extends BaseWatcher {
  // Add any webview-specific fields here if needed in the future.
  // For now, it directly uses all fields from BaseWatcher.
}

export interface WatchersFile {
  watchers: Watcher[]; // This might need to be updated if Watcher type changes significantly for UI
}
