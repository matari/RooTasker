<div align="center">
  <img src="assets/icons/RooPlus_dark.png" alt="Roo+ Icon" width="150" />
</div>

<div align="center">
<h1>Roo+</h1>

<a href="https://marketplace.visualstudio.com/items?itemName=MrMatari.rooplus" target="_blank"><img src="https://img.shields.io/badge/Download%20on%20VS%20Marketplace-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="Download on VS Marketplace"></a>

</div>

**Roo+** is a powerful task automation extension for VS Code that seamlessly integrates with [Roo Code](https://roocode.com/). It provides both advanced task scheduling and intelligent file watching capabilities to streamline your development workflow.

## Key Features

### 🕒 Advanced Task Scheduling

Schedule tasks to run automatically based on various timing options:

- **One-time Tasks**: Schedule a task for a specific date and time
- **Interval Tasks**: Configure tasks to run at regular intervals (minutes, hours, days)
- **Recurring Tasks**: Set up tasks that repeat daily, weekly, monthly, or yearly
- **Cron-based Tasks**: Use cron expressions for complex, precise scheduling
- **Day Selection**: Configure tasks to run only on specific days of the week
- **Time Windows**: Set start and expiration dates to control when schedules are active
- **Execution Limits**: Set maximum number of times a task should run
- **User Activity Awareness**: Optionally run tasks only when there's been user activity

### 🔍 File Watching

Automate responses to file system changes:

- **Directory Monitoring**: Watch specific directories for file changes
- **File Type Filtering**: Configure watchers to only trigger on specific file types
- **Custom Prompts**: Define custom instructions for Roo Code when files change
- **Mode Selection**: Choose which Roo Code mode to use when responding to changes

### ⚙️ Task Execution Options

Fine-tune how tasks interact with your workflow:

- **Wait Mode**: Wait for a specified period of inactivity before executing a task
- **Interrupt Mode**: Automatically interrupt any running task to execute the scheduled task
- **Skip Mode**: Skip execution if another task is already running

### 📝 Prompt Management

Create, manage, and run reusable prompts directly within Roo+:

- **Centralized Prompt Library**: Store and organize your frequently used prompts.
- **Easy Editing**: Edit prompt titles, content, and tags.
- **Quick Execution**: Run any saved prompt directly with a "Run Now" button.
- **Tagging & Filtering**: Organize prompts with tags for easy searching and categorization (filtering to be implemented).
- **Example Prompts**: Get started quickly with a set of pre-defined example prompts for common development tasks.
- **Integration with Schedules & Watchers**: Use saved prompts as the task instructions for scheduled tasks or file watchers.

### 🔌 Seamless Roo Code Integration

Roo+ exposes a comprehensive API via VS Code commands, allowing deep integration with [Roo Code](https://roocode.com/) and other extensions to:

- Programmatically manage projects, schedules, and watchers.
- Trigger Roo Code tasks with custom instructions as part of an automated workflow.
- Query Roo+ for information about its configuration and status.

### 🤖 Programmatic and AI Assistant Access

Roo+'s functionalities can be controlled programmatically through its VS Code command API. This allows:

- Integration with other VS Code extensions.
- Scripting of Roo+ actions from external tools or build processes.
- Control by AI assistants (like Roo Code) that are capable of executing VS Code commands. All features such as managing schedules, watchers, projects, and triggering tasks are available via this API.

## Programmatic API Access

Roo+'s full functionality is available programmatically via VS Code's command API (`vscode.commands.executeCommand`). This allows for powerful integrations and scripting capabilities.

The available commands and their expected parameters are defined by the `RooPlusAPI` TypeScript interface, located in the `src/api/RooPlusAPI.ts` file within the extension's source code. This interface serves as the contract for interacting with Roo+.

**Example: Creating a Project via the API**

Here's how another VS Code extension or an external script (that can interface with VS Code commands) could create a new Roo+ project:

```typescript
// Ensure vscode module is available in your context
// const vscode = require('vscode'); 

async function createRooPlusProject() {
  try {
    const projectDetails = await vscode.commands.executeCommand('rooplus.api.createProject', {
      name: "My Automated Project",
      description: "A project managed via Roo+'s command API",
      directoryPath: "/path/to/your/project/folder", // Optional: provide a relevant path
      color: "#3498DB" // Optional: specify a color
    });

    if (projectDetails && projectDetails.success && projectDetails.project) {
      console.log("Roo+ Project created successfully:", projectDetails.project);
    } else {
      console.error("Failed to create Roo+ project:", projectDetails?.error || "Unknown error");
    }
  } catch (error) {
    console.error("Error executing Roo+ command:", error);
  }
}

// createRooPlusProject();
```

Refer to the `RooPlusAPI` interface in `src/api/RooPlusAPI.ts` for a complete list of commands and their data structures for projects, schedules, and watchers.

### Troubleshooting

- **Command Not Found**: Ensure the Roo+ extension is installed and activated in VS Code.
- **Incorrect Parameters**: Refer to the `RooPlusAPI` interface and the JSDoc comments in `src/extension.ts` for the correct parameters and types for each command.

## Use Cases

- **Automated Code Reviews**: Schedule regular code quality checks
- **Real-time Testing**: Run tests automatically when code files change
- **Documentation Updates**: Keep documentation in sync with code changes
- **Dependency Checks**: Regularly verify and update project dependencies
- **Codebase Analysis**: Run periodic analysis to identify optimization opportunities
- **Custom Workflows**: Automate any repetitive development task with natural language instructions
- **Voice-Powered Automations**: Monitor a folder for new voice transcripts; upon detection, trigger custom Roo Code actions to process the transcript, enabling seamless voice-activated workflows.

## Usage Tips

- Roo+ will run tasks if your screen is locked, but cannot wake up your computer
- When VS Code starts or wakes up, any pending tasks will execute
- For one-time and interval tasks with specific start times, next execution times are calculated from the scheduled time (e.g., 10:00am, 11:00am) regardless of when the previous task actually ran
- For interval tasks without specific start times, next execution times are calculated from the previous execution time
- File watchers trigger only when actual changes are detected, not simply when files are accessed

## Getting Started

1. Open the Roo+ panel in VS Code's activity bar
2. Switch between the "Scheduled Tasks" and "Watchers" tabs
3. Click "Add Schedule" or "Add Watcher" to create new automations
4. Configure your automation parameters and save
5. Monitor task execution in the status list

## Acknowledgements

This project was originally forked from [kyle-apex/roo-scheduler](https://github.com/kyle-apex/roo-scheduler). We extend our gratitude to the original authors for their foundational work.

## License

[Apache 2.0 © 2025 Roo+](./LICENSE)

---

*Roo+ is maintained independently and is not an official product of the Roo Code team.*
