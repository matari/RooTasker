import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { Prompt } from '../../shared/ProjectTypes';
import { GlobalFileNames } from '../../shared/globalFileNames'; // Import GlobalFileNames

const PROMPTS_INDEX_FILE_NAME = 'prompts_index.json';
const PROMPTS_DIR_NAME = 'prompts_library';

// Helper to sanitize titles for use in file names
const sanitizeTitleForFileName = (title: string): string => {
  return title.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').slice(0, 50);
};

export class PromptStorageService {
    private context: vscode.ExtensionContext;
    private promptsIndexFilePath: string | null = null;
    private promptsDirPAth: string | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private async ensureGlobalStoragePath(): Promise<string> {
        const globalStoragePath = this.context.globalStorageUri.fsPath;
        try {
            await fs.mkdir(globalStoragePath, { recursive: true });
        } catch (error) {
            console.error('Failed to create global storage directory:', error);
            throw new Error('Could not initialize global storage directory.');
        }
        return globalStoragePath;
    }

    public async getPromptsDirPath(): Promise<string> { // Made public
        if (!this.promptsDirPAth) {
            const globalStoragePath = await this.ensureGlobalStoragePath();
            this.promptsDirPAth = path.join(globalStoragePath, PROMPTS_DIR_NAME);
            try {
                await fs.mkdir(this.promptsDirPAth, { recursive: true });
            } catch (error) {
                console.error(`Failed to create prompts directory at ${this.promptsDirPAth}:`, error);
                throw new Error('Could not initialize prompts directory.');
            }
        }
        return this.promptsDirPAth;
    }

    private async getPromptsIndexFilePath(): Promise<string> {
        if (!this.promptsIndexFilePath) {
            const globalStoragePath = await this.ensureGlobalStoragePath();
            this.promptsIndexFilePath = path.join(globalStoragePath, PROMPTS_INDEX_FILE_NAME);
        }
        return this.promptsIndexFilePath;
    }

    private async readPromptIndex(): Promise<Omit<Prompt, 'content'>[]> {
        const indexPath = await this.getPromptsIndexFilePath();
        try {
            const fileContent = await fs.readFile(indexPath, 'utf-8');
            return JSON.parse(fileContent) as Omit<Prompt, 'content'>[];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return []; // File not found, return empty array
            }
            console.error('Error reading prompts index file:', error);
            return [];
        }
    }

    private async writePromptIndex(promptsMetadata: Omit<Prompt, 'content'>[]): Promise<void> {
        const indexPath = await this.getPromptsIndexFilePath();
        try {
            await fs.writeFile(indexPath, JSON.stringify(promptsMetadata, null, 2), 'utf-8');
        } catch (error) {
            console.error('Error writing prompts index file:', error);
        }
    }

    private async getPromptContent(filePathInLibrary: string): Promise<string | undefined> {
        const promptsDir = await this.getPromptsDirPath();
        const fullPath = path.join(promptsDir, filePathInLibrary);
        try {
            return await fs.readFile(fullPath, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.warn(`Prompt content file not found: ${fullPath}`);
                return undefined; 
            }
            console.error(`Error reading prompt content file ${fullPath}:`, error);
            return undefined;
        }
    }

    private async writePromptContent(filePathInLibrary: string, content: string): Promise<void> {
        const promptsDir = await this.getPromptsDirPath();
        const fullPath = path.join(promptsDir, filePathInLibrary);
        try {
            await fs.writeFile(fullPath, content, 'utf-8');
        } catch (error) {
            console.error(`Error writing prompt content file ${fullPath}:`, error);
            throw new Error(`Failed to write prompt content to ${filePathInLibrary}`);
        }
    }
    
    private async deletePromptContentFile(filePathInLibrary: string): Promise<void> {
        const promptsDir = await this.getPromptsDirPath();
        const fullPath = path.join(promptsDir, filePathInLibrary);
        try {
            await fs.unlink(fullPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.warn(`Attempted to delete non-existent prompt content file: ${fullPath}`);
            } else {
                console.error(`Error deleting prompt content file ${fullPath}:`, error);
            }
        }
    }

    // Returns metadata only
    async getPromptsMetadata(): Promise<Omit<Prompt, 'content'>[]> {
        return await this.readPromptIndex();
    }

    // Returns full prompt with content
    async getPrompt(promptId: string): Promise<Prompt | undefined> {
        const promptsMetadata = await this.readPromptIndex();
        const metadata = promptsMetadata.find(p => p.id === promptId);
        if (!metadata) return undefined;

        const content = await this.getPromptContent(metadata.filePath);
        // If content is undefined (file not found), we might still return metadata
        // or decide this means the prompt is invalid. For now, include content if available.
        return { ...metadata, content: content ?? "" }; // Ensure content is string
    }

    async addPrompt(promptData: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'isArchived' | 'filePath' | 'currentVersion'> & { content: string }): Promise<Prompt> {
        const promptsMetadata = await this.readPromptIndex();
        const now = new Date().toISOString();
        const newPromptId = uuidv4();
        const version = 1;
        const sanitizedTitle = sanitizeTitleForFileName(promptData.title);
        const fileName = `${newPromptId}_${sanitizedTitle}_v${version}.md`;
        
        const newPromptMetadata: Omit<Prompt, 'content'> = {
            id: newPromptId,
            title: promptData.title,
            description: promptData.description,
            tags: promptData.tags || [],
            filePath: fileName,
            currentVersion: version,
            createdAt: now,
            updatedAt: now,
            isArchived: false,
        };

        await this.writePromptContent(fileName, promptData.content);
        promptsMetadata.push(newPromptMetadata);
        await this.writePromptIndex(promptsMetadata);
        
        return { ...newPromptMetadata, content: promptData.content };
    }

    async updatePrompt(
        promptId: string, 
        updates: Partial<Omit<Prompt, 'id' | 'createdAt' | 'filePath' | 'currentVersion'>> & { content?: string }
    ): Promise<Prompt | undefined> {
        let promptsMetadata = await this.readPromptIndex();
        const promptIndex = promptsMetadata.findIndex(p => p.id === promptId);

        if (promptIndex === -1) return undefined;

        const existingMetadata = promptsMetadata[promptIndex];
        let newFilePath = existingMetadata.filePath;
        let newVersion = existingMetadata.currentVersion;
        let currentContent = updates.content;

        if (updates.content !== undefined) {
            const oldContent = await this.getPromptContent(existingMetadata.filePath);
            if (updates.content !== oldContent) {
                newVersion++;
                const sanitizedTitle = sanitizeTitleForFileName(updates.title || existingMetadata.title);
                newFilePath = `${promptId}_${sanitizedTitle}_v${newVersion}.md`;
                await this.writePromptContent(newFilePath, updates.content);
                // Optionally delete old version file(s) or keep for history
                // For now, we just create a new one and update path.
            }
        } else {
            // If content is not in updates, fetch it to return the full prompt object
            currentContent = await this.getPromptContent(existingMetadata.filePath);
        }
        
        const updatedMetadata: Omit<Prompt, 'content'> = {
            ...existingMetadata,
            title: updates.title ?? existingMetadata.title,
            description: updates.description ?? existingMetadata.description,
            tags: updates.tags ?? existingMetadata.tags,
            isArchived: updates.isArchived ?? existingMetadata.isArchived,
            filePath: newFilePath,
            currentVersion: newVersion,
            updatedAt: new Date().toISOString(),
        };

        promptsMetadata[promptIndex] = updatedMetadata;
        await this.writePromptIndex(promptsMetadata);
        return { ...updatedMetadata, content: currentContent ?? "" };
    }

    async deletePrompt(promptId: string): Promise<boolean> {
        // Prevent deletion of known system prompts
        const systemPromptIds = [GlobalFileNames.promptImproverMetaPromptId /*, other system prompt IDs if any */];
        if (systemPromptIds.includes(promptId)) {
            console.warn(`Attempted to delete system prompt (${promptId}). Operation denied.`);
            vscode.window.showWarningMessage("System prompts cannot be deleted, but their content can be edited.");
            return false;
        }

        let promptsMetadata = await this.readPromptIndex();
        const promptToDelete = promptsMetadata.find(p => p.id === promptId);
        
        if (!promptToDelete) return false;

        // For now, delete only the current version's file.
        // A more robust solution might involve deleting all versioned files for this promptId.
        await this.deletePromptContentFile(promptToDelete.filePath);
        // TODO: Implement deletion of all historical version files if needed.

        const updatedPromptsMetadata = promptsMetadata.filter(p => p.id !== promptId);
        if (updatedPromptsMetadata.length < promptsMetadata.length) {
            await this.writePromptIndex(updatedPromptsMetadata);
            return true;
        }
        return false;
    }

    async archivePrompt(promptId: string, archive: boolean): Promise<Prompt | undefined> {
        return this.updatePrompt(promptId, { isArchived: archive });
    }

    async initializeExamplePrompts(): Promise<void> {
        const { GlobalFileNames } = await import('../../shared/globalFileNames');
        let existingPromptsMetadata = await this.readPromptIndex();
        
        // Initialize Prompt Improver Meta Prompt
        const promptImproverMetaPromptExists = existingPromptsMetadata.some(p => p.id === GlobalFileNames.promptImproverMetaPromptId);
        if (!promptImproverMetaPromptExists) {
            const improverMetaPromptContent = `You are an AI assistant specializing in refining prompts. The content of the file being processed is a user's prompt.
Your task is to improve this prompt for clarity, conciseness, and effectiveness when used with an AI model.

Instructions:
1. Read the prompt content from the provided file.
2. Generate an improved version of the prompt.
3. Create a new file in the '../${GlobalFileNames.promptImprovementProcessedDirName}/' directory (relative to the input file's directory).
4. The new filename MUST be identical to the input filename.
5. The new file should contain ONLY the improved prompt text. Do not add any conversational wrappers, explanations, or markdown formatting unless it's part of the improved prompt itself.`;

            const improverPromptData = {
                id: GlobalFileNames.promptImproverMetaPromptId, // Use predefined ID
                title: "System: Prompt Improver Meta-Prompt",
                description: "Internal prompt used by RooTasker to instruct AI on how to improve user prompts.",
                content: improverMetaPromptContent,
                tags: ["system", "internal", "meta-prompt"],
                // filePath, currentVersion, createdAt, updatedAt, isArchived will be set by addPromptInternal
            };
            // Need a way to add with a specific ID, or update if exists with different content.
            // For simplicity, if it doesn't exist, add it. If it does, we assume it's correct for now.
            // This requires a slight modification to addPrompt or a new internal method.
            // Let's assume addPrompt can take an ID for this specific case, or we handle it carefully.
            // For now, we'll use a simplified add that generates ID, then update if needed.
            // This is not ideal. Let's refine addPrompt to accept optional ID for system prompts.
            // For now, I'll just log if it exists. The creation logic in extension.ts will use it.
            // The actual creation of this prompt will be handled by ensuring it exists via getPrompt/addPrompt.
            // This initializeExamplePrompts should only add user-facing examples if the prompts list is totally empty.
        }


        // Initialize user-facing example prompts ONLY if no user prompts exist.
        // We filter out system prompts before checking length.
        const userPrompts = existingPromptsMetadata.filter(p => !p.id.startsWith("@@System"));
        if (userPrompts.length > 0) {
            console.log("User prompts already exist. Skipping initialization of example user prompts.");
            return;
        }

        const examplePromptsData: (Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'isArchived' | 'filePath' | 'currentVersion'> & { content: string })[] = [
            {
                title: "Code Review Assistant",
                description: "Helps review code for quality, bugs, and improvements.",
                content: `Please review the code in this project and provide detailed feedback on:\n\n1. Code quality and best practices\n2. Potential bugs or issues\n3. Performance improvements\n4. Security vulnerabilities\n5. Suggestions for refactoring\n\nFocus on constructive feedback and provide specific examples where improvements can be made.`,
                tags: ["review", "code", "analysis"]
            },
            // ... (add other example prompts here, ensuring they have title, content, and optional description/tags)
            {
                title: "Unit Test Generator",
                description: "Generates unit tests for selected code.",
                content: `Generate comprehensive unit tests for the selected code/file. \n\nPlease:\n- Use the appropriate testing framework for this project\n- Cover edge cases and error scenarios\n- Include both positive and negative test cases\n- Add descriptive test names\n- Ensure good test coverage\n- Follow testing best practices\n\nMake the tests maintainable and easy to understand.`,
                tags: ["test", "testing", "code"]
            },
        ];

        for (const promptData of examplePromptsData) {
            await this.addPrompt(promptData);
        }
        console.log(`Added ${examplePromptsData.length} example user prompts`);
    }

    // Helper to ensure a system prompt exists with specific content
    public async ensureSystemPrompt(
        promptId: string, 
        title: string, 
        description: string, 
        content: string, 
        tags: string[]
    ): Promise<Prompt> {
        const existingPrompt = await this.getPrompt(promptId);
        if (existingPrompt && existingPrompt.content === content && existingPrompt.title === title) {
            return existingPrompt;
        }
        
        const promptData = { title, description, content, tags };
        if (existingPrompt) {
            // Update if content or other critical metadata differs
            console.log(`Updating system prompt: ${title}`);
            return await this.updatePrompt(promptId, promptData) as Prompt; // Cast as Prompt, updatePrompt returns Prompt | undefined
        } else {
            console.log(`Creating system prompt: ${title}`);
            // Need to adapt addPrompt or use a more direct way to insert with a specific ID
            // For now, this is a conceptual placeholder for how it would be added.
            // A direct addWithId method would be better.
            // Let's modify addPrompt to accept an optional ID.
            const promptsMetadata = await this.readPromptIndex();
            const now = new Date().toISOString();
            const version = 1;
            const sanitizedTitle = sanitizeTitleForFileName(title);
            const fileName = `${promptId}_${sanitizedTitle}_v${version}.md`;
            
            const newPromptMetadata: Omit<Prompt, 'content'> = {
                id: promptId, // Use provided ID
                title,
                description,
                tags,
                filePath: fileName,
                currentVersion: version,
                createdAt: now,
                updatedAt: now,
                isArchived: false,
            };
            await this.writePromptContent(fileName, content);
            promptsMetadata.push(newPromptMetadata);
            await this.writePromptIndex(promptsMetadata);
            return { ...newPromptMetadata, content };
        }
    }
}
