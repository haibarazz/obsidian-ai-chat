/**
 * Context Manager for the AI Chat Sidebar plugin
 * Handles file, folder, and selection context for AI conversations
 * 
 * Requirements: 5.2, 5.3, 5.4, 6.3, 6.4
 */

import type { ContextItem } from '../types';
import type { App, TFile, TFolder, TAbstractFile } from 'obsidian';

/**
 * Generates a unique ID for context items
 */
export function generateContextId(): string {
  return `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validates a file path for security (prevents directory traversal)
 */
export function validateFilePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  // Normalize path and check for directory traversal attempts
  const normalized = path.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return false;
  }
  
  return true;
}

/**
 * Checks if a file is a markdown file
 */
export function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/**
 * Formats file content for context display
 */
export function formatFileContext(path: string, content: string): string {
  return `--- File: ${path} ---\n${content}\n--- End of ${path} ---`;
}

/**
 * Formats selection content as a quoted block
 * Requirements: 6.4 - WHEN selected text is added as context THEN the Plugin SHALL display it as a quoted block
 */
export function formatSelectionContext(content: string): string {
  const lines = content.split('\n');
  return lines.map(line => `> ${line}`).join('\n');
}

/**
 * Interface for file system operations (allows mocking in tests)
 */
export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  getFile(path: string): TFile | null;
  getFolder(path: string): TFolder | null;
  listFiles(folder: TFolder): TAbstractFile[];
}

/**
 * Creates a file system adapter from an Obsidian App instance
 */
export function createObsidianAdapter(app: App): FileSystemAdapter {
  return {
    async readFile(path: string): Promise<string> {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof app.vault.adapter.constructor)) {
        const tfile = app.vault.getAbstractFileByPath(path) as TFile;
        if (!tfile) {
          throw new Error(`File not found: ${path}`);
        }
        return app.vault.read(tfile);
      }
      throw new Error(`File not found: ${path}`);
    },
    getFile(path: string): TFile | null {
      const file = app.vault.getAbstractFileByPath(path);
      if (file && 'extension' in file) {
        return file as TFile;
      }
      return null;
    },
    getFolder(path: string): TFolder | null {
      const folder = app.vault.getAbstractFileByPath(path);
      if (folder && 'children' in folder) {
        return folder as TFolder;
      }
      return null;
    },
    listFiles(folder: TFolder): TAbstractFile[] {
      return folder.children;
    },
  };
}

/**
 * ContextManager class handles context items for AI conversations
 * Provides methods to add, remove, and format context from files, folders, and selections
 */
export class ContextManager {
  private contextItems: Map<string, ContextItem> = new Map();
  private fileSystem: FileSystemAdapter | null = null;

  constructor(fileSystem?: FileSystemAdapter) {
    this.fileSystem = fileSystem ?? null;
  }

  /**
   * Sets the file system adapter
   */
  setFileSystem(fileSystem: FileSystemAdapter): void {
    this.fileSystem = fileSystem;
  }

  /**
   * Adds a file as context
   * Requirements: 5.3 - WHEN the user selects a file THEN the Plugin SHALL add the file content to the conversation context
   */
  async addFile(path: string): Promise<ContextItem> {
    if (!validateFilePath(path)) {
      throw new Error(`Invalid file path: ${path}`);
    }

    if (!this.fileSystem) {
      throw new Error('File system adapter not configured');
    }

    const file = this.fileSystem.getFile(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    const content = await this.fileSystem.readFile(path);
    const displayName = path.split('/').pop() || path;

    const contextItem: ContextItem = {
      id: generateContextId(),
      type: 'file',
      path,
      content,
      displayName,
    };

    this.contextItems.set(contextItem.id, contextItem);
    return contextItem;
  }

  /**
   * Adds all markdown files from a folder as context
   * Requirements: 5.4 - WHEN the user selects a folder THEN the Plugin SHALL add all markdown files within that folder to the context
   */
  async addFolder(path: string): Promise<ContextItem[]> {
    if (!validateFilePath(path)) {
      throw new Error(`Invalid folder path: ${path}`);
    }

    if (!this.fileSystem) {
      throw new Error('File system adapter not configured');
    }

    const folder = this.fileSystem.getFolder(path);
    if (!folder) {
      throw new Error(`Folder not found: ${path}`);
    }

    const addedItems: ContextItem[] = [];
    const markdownFiles = this.collectMarkdownFiles(folder);

    for (const file of markdownFiles) {
      try {
        const content = await this.fileSystem.readFile(file.path);
        const displayName = file.path.split('/').pop() || file.path;

        const contextItem: ContextItem = {
          id: generateContextId(),
          type: 'folder',
          path: file.path,
          content,
          displayName: `${path}/${displayName}`,
        };

        this.contextItems.set(contextItem.id, contextItem);
        addedItems.push(contextItem);
      } catch (error) {
        // Skip files that can't be read, log warning
        console.warn(`Could not read file ${file.path}:`, error);
      }
    }

    return addedItems;
  }

  /**
   * Recursively collects all markdown files from a folder
   */
  private collectMarkdownFiles(folder: TFolder): TFile[] {
    if (!this.fileSystem) {
      return [];
    }

    const files: TFile[] = [];
    const children = this.fileSystem.listFiles(folder);

    for (const child of children) {
      if ('extension' in child) {
        // It's a file
        const file = child as TFile;
        if (isMarkdownFile(file.path)) {
          files.push(file);
        }
      } else if ('children' in child) {
        // It's a folder, recurse
        files.push(...this.collectMarkdownFiles(child as TFolder));
      }
    }

    return files;
  }

  /**
   * Adds selected text as context
   * Requirements: 6.3 - WHEN the AI Chat Sidebar opens with selected text THEN the Plugin SHALL add the selected text as a context item
   */
  addSelection(content: string, sourcePath?: string): ContextItem {
    if (!content || content.trim().length === 0) {
      throw new Error('Selection content cannot be empty');
    }

    const displayName = sourcePath 
      ? `Selection from ${sourcePath.split('/').pop()}`
      : 'Text selection';

    const contextItem: ContextItem = {
      id: generateContextId(),
      type: 'selection',
      path: sourcePath,
      content: content,
      displayName,
    };

    this.contextItems.set(contextItem.id, contextItem);
    return contextItem;
  }

  /**
   * Removes a context item by ID
   * Requirements: 5.6 - WHEN the user removes a context item THEN the Plugin SHALL exclude that content from subsequent messages
   */
  removeContext(id: string): boolean {
    return this.contextItems.delete(id);
  }

  /**
   * Gets all active context items
   */
  getActiveContext(): ContextItem[] {
    return Array.from(this.contextItems.values());
  }

  /**
   * Gets a context item by ID
   */
  getContextItem(id: string): ContextItem | undefined {
    return this.contextItems.get(id);
  }

  /**
   * Checks if a context item exists
   */
  hasContext(id: string): boolean {
    return this.contextItems.has(id);
  }

  /**
   * Clears all context items
   */
  clearContext(): void {
    this.contextItems.clear();
  }

  /**
   * Gets the count of active context items
   */
  getContextCount(): number {
    return this.contextItems.size;
  }

  /**
   * Formats all context items for API requests
   * Requirements: 5.7 - WHEN the user sends a message THEN the Plugin SHALL include all active context items in the API request
   */
  formatContextForAPI(): string {
    const items = this.getActiveContext();
    if (items.length === 0) {
      return '';
    }

    const formattedItems = items.map(item => {
      if (item.type === 'selection') {
        return `[Selected Text]\n${formatSelectionContext(item.content)}`;
      } else {
        return formatFileContext(item.path || item.displayName, item.content);
      }
    });

    return `The following context has been provided:\n\n${formattedItems.join('\n\n')}`;
  }

  /**
   * Loads context items from a saved state
   */
  loadContext(items: ContextItem[]): void {
    this.contextItems.clear();
    for (const item of items) {
      this.contextItems.set(item.id, item);
    }
  }

  /**
   * Exports context items for saving
   */
  exportContext(): ContextItem[] {
    return this.getActiveContext();
  }
}
