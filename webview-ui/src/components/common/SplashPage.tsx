import React from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';
import { Button } from '../ui/button'; // Moved Button import

type ExampleItem = {
  icon?: string; // Codicon class
  text: string;
};

type SplashPageProps = {
  tabType: 'schedules' | 'watchers' | 'projects' | 'prompts' | 'generic';
  title?: string;
  description?: string;
  examples?: ExampleItem[];
  featureIcon?: string; // Codicon class for the main feature icon
  showCreateProjectHelper?: boolean;
  onCreateProject?: () => void;
};

const SplashPage: React.FC<SplashPageProps> = ({
  tabType,
  title,
  description,
  examples,
  featureIcon,
  showCreateProjectHelper = false,
  onCreateProject,
}) => {
	const { rootaskerLiteSvgUri: rooPlusLiteSvgUri, rootaskerDarkSvgUri: rooPlusDarkSvgUri } = useExtensionState(); // Renamed for clarity

	interface SplashPageDefaultContentEntry {
		title: string;
		description: string;
		featureIcon: string;
		examples: ExampleItem[];
	}

	const defaultContent: Record<'schedules' | 'watchers' | 'projects' | 'prompts' | 'generic', SplashPageDefaultContentEntry> = {
		generic: {
			title: "Welcome to Roo+!",
			description: "Your advanced task automation assistant.",
			featureIcon: "codicon-rocket",
			examples: [{ text: "Loading your workspace..." }] // This is valid for ExampleItem[] as icon is optional
		},
		schedules: {
			title: "No Schedules Yet",
			description: "Automate your workflows by creating scheduled tasks. Run tasks at specific times, intervals, or using cron expressions.",
			featureIcon: "codicon-calendar",
			examples: [
				{ icon: "codicon-rocket", text: "One-time: Run a script tonight at 10 PM." },
				{ icon: "codicon-history", text: "Interval: Summarize new emails every 30 minutes." },
				{ icon: "codicon-gear", text: "Cron: Perform daily backups at 2 AM (0 2 * * *)." },
				{ icon: "codicon-sync", text: "Recurring: Fetch AI news and post to WordPress/Obsidian weekly on Mondays." },
			],
		},
		watchers: {
			title: "No Watchers Yet",
			description: "Automatically trigger tasks when files change in specified directories. Keep your projects in sync or react to new content.",
			featureIcon: "codicon-eye",
			examples: [
				{ icon: "codicon-mic", text: "Watch a 'Voice Notes' directory synced from voicenotes.com. When a new transcript appears, trigger a Boomerang (orchestrator) agent to analyze and complete tasks described in the transcript." },
				{ icon: "codicon-cloud-download", text: "Monitor a synced Google Drive folder for new documents to process." },
				{ icon: "codicon-git-commit", text: "Trigger a build script when code changes in your 'src' directory." },
			],
		},
		projects: {
			title: "No Projects Yet",
			description: "Organize your work by creating projects. Associate schedules and watchers with specific projects to manage them effectively.",
			featureIcon: "codicon-project",
			examples: [
				{ icon: "codicon-code", text: "Software Project: Group development tasks, build scripts, and test watchers." },
				{ icon: "codicon-book", text: "Fiction Novel: Schedule writing reminders, watch manuscript folders for changes." },
				{ icon: "codicon-megaphone", text: "Non-Fiction Podcast: Manage episode research, watch audio edit folders, schedule publishing tasks." },
			],
		},
		prompts: {
			title: "No Prompts Yet",
			description: "Create and manage reusable prompts for Roo Code. Use them for common tasks, code generation, reviews, and more.",
			featureIcon: "codicon-comment-discussion", // Or a more specific icon like 'codicon-lightbulb'
			examples: [
				{ icon: "codicon-code", text: "Generate boilerplate code for a new React component." },
				{ icon: "codicon-search", text: "Review the current file for potential bugs." },
				{ icon: "codicon-book", text: "Create documentation for a selected function." },
				{ icon: "codicon-beaker", text: "Write unit tests for the selected class." },
			],
		},
	};

	const currentTitle = title || defaultContent[tabType].title;
	const currentDescription = description || defaultContent[tabType].description;
	const currentExamples = examples || defaultContent[tabType].examples;
	const currentFeatureIcon = featureIcon || defaultContent[tabType].featureIcon;

	return (
		<div className="flex flex-col items-center justify-start h-full text-center p-8 pt-20 text-vscode-editor-foreground"> {/* Changed justify-center to justify-start and added pt-20 */}
			{rooPlusLiteSvgUri && rooPlusDarkSvgUri && (
				<picture className="mb-2"> {/* Moved Roo+ logo up by reducing bottom margin */}
					<source srcSet={rooPlusDarkSvgUri} media="(prefers-color-scheme: dark)" />
          <source srcSet={rooPlusLiteSvgUri} media="(prefers-color-scheme: light)" />
          <img
            src={rooPlusLiteSvgUri}
            alt="Roo+ Logo"
            className="w-24 h-24" // Made logo smaller (150px to 96px approx)
          />
        </picture>
      )}

      {currentFeatureIcon && <span className={`codicon ${currentFeatureIcon} text-4xl mb-3 text-vscode-icon-foreground`}></span>}
      
      <h1 className="text-2xl font-semibold mb-2">{currentTitle}</h1>
      <p className="text-md text-vscode-descriptionForeground mb-6 max-w-md">
        {currentDescription}
      </p>

      {showCreateProjectHelper && (tabType === 'schedules' || tabType === 'watchers') && (
        <div className="mb-6 p-4 border border-vscode-textSeparator-foreground rounded-md bg-vscode-editorWidget-background max-w-md">
          <p className="text-sm text-vscode-descriptionForeground mb-2">
            {tabType === 'schedules' ? 'Schedules' : 'Watchers'} are organized within projects.
            You don't have any projects yet.
          </p>
          <Button onClick={onCreateProject} size="sm">
            <span className="codicon codicon-add mr-1"></span>
            Create Your First Project
          </Button>
        </div>
      )}

      {currentExamples && currentExamples.length > 0 && (
        <div className="mt-4 text-left max-w-lg w-full">
          <h2 className="text-lg font-medium mb-3 text-vscode-editor-foreground">Examples:</h2>
          <ul className="space-y-2">
            {currentExamples.map((example, index) => (
              <li key={index} className="flex items-start text-sm text-vscode-descriptionForeground">
                {example.icon && <span className={`codicon ${example.icon} mr-2 mt-0.5 text-vscode-icon-foreground`}></span>}
                <span>{example.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SplashPage;
