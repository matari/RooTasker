import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises'; // Using fs.promises for async file operations
import { v4 as uuidv4 } from 'uuid';
import { Prompt } from '../../shared/ProjectTypes';
// import { getStoragePath } from '../../shared/storagePathManager'; // REMOVED - Not needed as globalStorageUri is used

const PROMPTS_FILE_NAME = 'prompts.json';

export class PromptStorageService {
    private context: vscode.ExtensionContext;
    private promptsFilePath: string | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // We'll initialize the path asynchronously
    }

    private async ensurePromptsFilePath(): Promise<string> {
        if (!this.promptsFilePath) {
            const globalStoragePath = this.context.globalStorageUri.fsPath;
            // Ensure the global storage directory exists
            try {
                await fs.mkdir(globalStoragePath, { recursive: true });
            } catch (error) {
                console.error('Failed to create global storage directory for prompts:', error);
                // Fallback or throw error if critical
                throw new Error('Could not initialize prompt storage directory.');
            }
            this.promptsFilePath = path.join(globalStoragePath, PROMPTS_FILE_NAME);
        }
        return this.promptsFilePath;
    }

    private async readPromptsFromFile(): Promise<Prompt[]> {
        const filePath = await this.ensurePromptsFilePath();
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(fileContent) as Prompt[];
        } catch (error) {
            // If file doesn't exist or is invalid JSON, return empty array
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            console.error('Error reading prompts file:', error);
            return []; // Or handle error more gracefully
        }
    }

    private async writePromptsToFile(prompts: Prompt[]): Promise<void> {
        const filePath = await this.ensurePromptsFilePath();
        try {
            await fs.writeFile(filePath, JSON.stringify(prompts, null, 2), 'utf-8');
        } catch (error) {
            console.error('Error writing prompts file:', error);
            // Handle error (e.g., show message to user)
        }
    }

    async getPrompts(): Promise<Prompt[]> {
        return await this.readPromptsFromFile();
    }

    async getPrompt(promptId: string): Promise<Prompt | undefined> {
        const prompts = await this.readPromptsFromFile();
        return prompts.find(p => p.id === promptId);
    }

    async addPrompt(promptData: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>): Promise<Prompt> {
        const prompts = await this.readPromptsFromFile();
        const now = new Date().toISOString();
        const newPrompt: Prompt = {
            ...promptData,
            id: uuidv4(),
            createdAt: now,
            updatedAt: now,
            isArchived: false,
        };
        prompts.push(newPrompt);
        await this.writePromptsToFile(prompts);
        return newPrompt;
    }

    async updatePrompt(promptId: string, updates: Partial<Omit<Prompt, 'id' | 'createdAt'>>): Promise<Prompt | undefined> {
        let prompts = await this.readPromptsFromFile();
        const promptIndex = prompts.findIndex(p => p.id === promptId);

        if (promptIndex === -1) {
            return undefined; // Or throw new Error('Prompt not found');
        }

        const updatedPrompt = {
            ...prompts[promptIndex],
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        prompts[promptIndex] = updatedPrompt;
        await this.writePromptsToFile(prompts);
        return updatedPrompt;
    }

    async deletePrompt(promptId: string): Promise<boolean> {
        let prompts = await this.readPromptsFromFile();
        const initialLength = prompts.length;
        prompts = prompts.filter(p => p.id !== promptId);

        if (prompts.length < initialLength) {
            await this.writePromptsToFile(prompts);
            return true;
        }
        return false; // Prompt not found
    }

    async archivePrompt(promptId: string, archive: boolean): Promise<Prompt | undefined> {
        return this.updatePrompt(promptId, { isArchived: archive });
    }

    async initializeExamplePrompts(): Promise<void> {
        const existingPrompts = await this.getPrompts();
        if (existingPrompts.length > 0) {
            // Already have prompts, don't add examples
            return;
        }

        const examplePrompts: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>[] = [
            {
                title: "Code Review Assistant",
                content: `Please review the code in this project and provide detailed feedback on:

1. Code quality and best practices
2. Potential bugs or issues
3. Performance improvements
4. Security vulnerabilities
5. Suggestions for refactoring

Focus on constructive feedback and provide specific examples where improvements can be made.`,
                tags: ["review", "code", "analysis"]
            },
            {
                title: "Unit Test Generator",
                content: `Generate comprehensive unit tests for the selected code/file. 

Please:
- Use the appropriate testing framework for this project
- Cover edge cases and error scenarios
- Include both positive and negative test cases
- Add descriptive test names
- Ensure good test coverage
- Follow testing best practices

Make the tests maintainable and easy to understand.`,
                tags: ["test", "testing", "code"]
            },
            {
                title: "Documentation Writer",
                content: `Create detailed documentation for this code/project including:

1. Overview and purpose
2. API documentation with examples
3. Installation instructions
4. Usage examples
5. Configuration options
6. Troubleshooting guide

Use clear language and provide code examples where appropriate. Format using Markdown.`,
                tags: ["documentation", "docs"]
            },
            {
                title: "Bug Finder & Fixer",
                content: `Analyze the code to find and fix bugs:

1. Identify potential runtime errors
2. Look for logic errors
3. Find edge cases not handled
4. Check for null/undefined references
5. Verify error handling
6. Test boundary conditions

For each issue found, explain the problem and provide a fix with clear reasoning.`,
                tags: ["bug", "fix", "debugging"]
            },
            {
                title: "Performance Optimizer",
                content: `Analyze and optimize the code for better performance:

1. Identify performance bottlenecks
2. Suggest algorithmic improvements
3. Optimize database queries if applicable
4. Reduce unnecessary computations
5. Improve memory usage
6. Consider caching strategies

Provide before/after comparisons and explain the performance gains.`,
                tags: ["performance", "optimization"]
            },
            {
                title: "Security Audit",
                content: `Perform a security audit on the codebase:

1. Check for common vulnerabilities (OWASP Top 10)
2. Review authentication and authorization
3. Identify potential injection points
4. Check for exposed sensitive data
5. Review dependency vulnerabilities
6. Suggest security best practices

Prioritize findings by severity and provide remediation steps.`,
                tags: ["security", "audit"]
            },
            {
                title: "Code Refactoring Assistant",
                content: `Refactor the code to improve maintainability:

1. Apply SOLID principles
2. Reduce code duplication
3. Improve naming conventions
4. Simplify complex functions
5. Extract reusable components
6. Improve code organization

Explain each refactoring decision and ensure functionality remains unchanged.`,
                tags: ["refactor", "cleanup", "code"]
            },
            {
                title: "Feature Implementation Helper",
                content: `Help implement a new feature by:

1. Understanding the requirements
2. Designing the solution architecture
3. Writing clean, maintainable code
4. Following project conventions
5. Adding appropriate tests
6. Updating documentation

Ask clarifying questions if requirements are unclear. Implement incrementally with explanations.`,
                tags: ["feature", "enhancement", "development"]
            },
            {
                title: "API Endpoint Creator",
                content: `Create a RESTful API endpoint with:

1. Proper HTTP methods and status codes
2. Request validation
3. Error handling
4. Authentication/authorization checks
5. Response formatting
6. API documentation
7. Integration tests

Follow REST best practices and project conventions.`,
                tags: ["api", "backend", "development"]
            },
            {
                title: "React Component Builder",
                content: `Create a React component that:

1. Uses modern React patterns (hooks, functional components)
2. Implements proper prop validation
3. Handles state management appropriately
4. Includes error boundaries if needed
5. Is accessible (ARIA attributes)
6. Is responsive and styled properly
7. Includes unit tests

Make it reusable and well-documented.`,
                tags: ["react", "frontend", "component", "development"]
            }
        ];

        // Add all example prompts
        for (const promptData of examplePrompts) {
            await this.addPrompt(promptData);
        }

        console.log(`Added ${examplePrompts.length} example prompts`);
    }
}
