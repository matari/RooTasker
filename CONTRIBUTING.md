# Contributing to RooTasker

RooTasker is a VS Code extension for task automation, built as a fork of Roo Code. We welcome contributions that enhance its functionality or fix issues.

You'll find the code for this extension primarily in:
- **Scheduler Components**:
  - `src/services/scheduler`
  - `webview-ui/src/components/scheduler`
- **Watcher Components**:
  - `src/services/watchers`
  - `webview-ui/src/components/watchers`
- **MCP Server Integration**:
  - `src/mcp_server`

## Join The Roo Code Community

We strongly encourage all contributors to join our [Discord community](https://discord.gg/roocode)! Being part of our Discord server helps you:

- Get real-time help and guidance on your contributions
- Connect with other contributors and core team members
- Stay updated on project developments and priorities
- Participate in discussions that shape Roo Code's future
- Find collaboration opportunities with other developers

## Reporting Bugs or Issues

Open a GitHub issue, and lets make it better together!
## Development Setup

1. **Clone** the repo:

```sh
git clone https://github.com/kyle-apex/roo-scheduler.git
```

2. **Install dependencies**:

```sh
npm run install:all
```

3. **Debug**:
   Press `F5` (or **Run** → **Start Debugging**) in VSCode to open a new session with Roo Code loaded.

Changes to the webview will appear immediately. Changes to the core extension will require a restart of the extension host.
