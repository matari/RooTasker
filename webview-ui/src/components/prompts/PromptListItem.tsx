import React, { useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Prompt } from "../../../../src/shared/ProjectTypes";

type PromptListItemProps = {
  prompt: Prompt;
  onEdit: (prompt: Prompt) => void;
  onRunNow: (promptId: string) => void;
  onDuplicate?: (promptId: string) => void;
  onArchive?: (promptId: string) => void;
  onDelete?: (promptId: string) => void;
  formatDate: (dateString: string) => string;
};

const PromptListItem: React.FC<PromptListItemProps> = ({
  prompt,
  onEdit,
  onRunNow,
  onDuplicate,
  onArchive,
  onDelete,
  formatDate,
}) => {
  const [isHoveringArchive, setIsHoveringArchive] = useState(false);

  // Get appropriate icon based on tags or content
  const getPromptIcon = (prompt: Prompt): string => {
    if (!prompt.tags || prompt.tags.length === 0) {
      return "codicon-comment";
    }
    
    // Check for specific tags to determine icon
    const tags = prompt.tags.map(t => t.toLowerCase());
    if (tags.includes("code") || tags.includes("coding") || tags.includes("development")) {
      return "codicon-code";
    }
    if (tags.includes("review") || tags.includes("analysis")) {
      return "codicon-eye";
    }
    if (tags.includes("test") || tags.includes("testing")) {
      return "codicon-beaker";
    }
    if (tags.includes("document") || tags.includes("documentation")) {
      return "codicon-book";
    }
    if (tags.includes("bug") || tags.includes("fix")) {
      return "codicon-bug";
    }
    if (tags.includes("feature") || tags.includes("enhancement")) {
      return "codicon-sparkle";
    }
    if (tags.includes("refactor") || tags.includes("cleanup")) {
      return "codicon-tools";
    }
    if (tags.includes("security")) {
      return "codicon-shield";
    }
    if (tags.includes("performance") || tags.includes("optimization")) {
      return "codicon-dashboard";
    }
    
    return "codicon-comment-discussion";
  };

  // Get preview text with proper truncation
  const getPreviewText = (content: string | undefined): string => {
    if (!content) return "No content yet...";
    const cleanContent = content.replace(/\n+/g, ' ').trim();
    return cleanContent.length > 150 ? cleanContent.substring(0, 150) + "..." : cleanContent;
  };

  return (
    <div
      className="cursor-pointer border border-vscode-panel-border rounded-md mb-3 shadow-sm hover:shadow-md transition-shadow duration-150 bg-vscode-sideBar-background"
      onClick={() => onEdit(prompt)}
    >
      <div className="flex items-start p-4 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center min-w-0 flex-grow">
              <span 
                className={`codicon ${getPromptIcon(prompt)} mr-2 text-vscode-descriptionForeground flex-shrink-0`} 
                title="Prompt type"
              />
              <span className="text-vscode-foreground font-medium text-base truncate" title={prompt.title}>
                {prompt.title}
              </span>
              {prompt.isArchived && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Archived
                </Badge>
              )}
            </div>
            
            <div className="flex flex-row gap-1 items-center flex-shrink-0">
              {/* Archive/Unarchive Button */}
              {onArchive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 p-0 rounded ${
                    prompt.isArchived
                      ? "text-vscode-descriptionForeground"
                      : isHoveringArchive
                      ? "text-vscode-descriptionForeground"
                      : "text-vscode-foreground"
                  }`}
                  onClick={e => {
                    e.stopPropagation();
                    onArchive(prompt.id);
                  }}
                  onMouseEnter={() => setIsHoveringArchive(true)}
                  onMouseLeave={() => setIsHoveringArchive(false)}
                  title={prompt.isArchived ? "Unarchive prompt" : "Archive prompt"}
                  aria-label={prompt.isArchived ? "Unarchive prompt" : "Archive prompt"}
                >
                  <span className={`codicon ${prompt.isArchived ? 'codicon-archive' : 'codicon-inbox'}`} />
                </Button>
              )}

              {/* Edit Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0"
                title="Edit prompt"
                onClick={e => {
                  e.stopPropagation();
                  onEdit(prompt);
                }}
                aria-label="Edit prompt"
              >
                <span className="codicon codicon-edit" />
              </Button>

              {/* Duplicate Button */}
              {onDuplicate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 p-0"
                  title="Duplicate prompt"
                  onClick={e => {
                    e.stopPropagation();
                    onDuplicate(prompt.id);
                  }}
                  aria-label="Duplicate prompt"
                >
                  <span className="codicon codicon-copy" />
                </Button>
              )}

              {/* Delete Button */}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 p-0"
                  title="Delete prompt"
                  onClick={e => {
                    e.stopPropagation();
                    onDelete(prompt.id);
                  }}
                  aria-label="Delete prompt"
                >
                  <span className="codicon codicon-trash text-vscode-errorForeground" />
                </Button>
              )}
            </div>
          </div>

          {/* Content Preview */}
          <div
            className="text-sm text-vscode-descriptionForeground mt-2 italic"
            style={{
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {getPreviewText(prompt.content)}
          </div>

          {/* Tags */}
          {prompt.tags && prompt.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {prompt.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Metadata and Actions */}
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-vscode-panel-border">
            {/* Creation/Update Time */}
            <div className="text-xs text-vscode-descriptionForeground">
              {prompt.updatedAt !== prompt.createdAt ? (
                <>
                  <span className="codicon codicon-edit mr-1" />
                  Updated {formatDate(prompt.updatedAt)}
                </>
              ) : (
                <>
                  <span className="codicon codicon-clock mr-1" />
                  Created {formatDate(prompt.createdAt)}
                </>
              )}
            </div>

            {/* Run Now Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 py-1"
              title="Run this prompt now"
              onClick={e => {
                e.stopPropagation();
                onRunNow(prompt.id);
              }}
              aria-label="Run prompt now"
              disabled={prompt.isArchived}
            >
              <span className="codicon codicon-play mr-1" />
              Run Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptListItem;
