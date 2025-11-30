/**
 * Property-based tests and unit tests for ContextManager
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  ContextManager,
  validateFilePath,
  isMarkdownFile,
  formatFileContext,
  formatSelectionContext,
  type FileSystemAdapter,
} from './context-manager';
import type { ContextItem } from '../types';
import type { TFile, TFolder, TAbstractFile } from 'obsidian';

/**
 * Creates a mock file system adapter for testing
 */
function createMockFileSystem(files: Map<string, string>, folders: Map<string, string[]>): FileSystemAdapter {
  return {
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    },
    getFile(path: string): TFile | null {
      if (files.has(path)) {
        return {
          path,
          name: path.split('/').pop() || path,
          extension: path.split('.').pop() || '',
          basename: path.split('/').pop()?.replace(/\.[^.]+$/, '') || '',
        } as unknown as TFile;
      }
      return null;
    },
    getFolder(path: string): TFolder | null {
      if (folders.has(path)) {
        const children = folders.get(path) || [];
        return {
          path,
          name: path.split('/').pop() || path,
          children: children.map(childPath => {
            if (files.has(childPath)) {
              return {
                path: childPath,
                name: childPath.split('/').pop() || childPath,
                extension: childPath.split('.').pop() || '',
              } as unknown as TFile;
            }
            // It's a subfolder
            return {
              path: childPath,
              name: childPath.split('/').pop() || childPath,
              children: (folders.get(childPath) || []).map(p => ({
                path: p,
                name: p.split('/').pop() || p,
                extension: p.split('.').pop() || '',
              })),
            } as unknown as TFolder;
          }),
        } as unknown as TFolder;
      }
      return null;
    },
    listFiles(folder: TFolder): TAbstractFile[] {
      return folder.children;
    },
  };
}

/**
 * Arbitrary for generating valid file paths (no directory traversal)
 */
const arbitraryValidFilePath = (): fc.Arbitrary<string> =>
  fc.array(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'), { minLength: 1, maxLength: 10 }),
    { minLength: 1, maxLength: 4 }
  ).map(parts => parts.join('/') + '.md');

/**
 * Arbitrary for generating file content
 */
const arbitraryFileContent = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 500 });

/**
 * Arbitrary for generating non-empty selection text
 */
const arbitrarySelectionText = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

describe('ContextManager Property Tests', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 15: File context inclusion**
   * 
   * *For any* file selected as context, the file's content should be added 
   * to the conversation context.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 15: File context inclusion', () => {
    it('should include file content in context when file is added', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidFilePath(),
          arbitraryFileContent(),
          async (filePath, fileContent) => {
            const files = new Map<string, string>([[filePath, fileContent]]);
            const folders = new Map<string, string[]>();
            const mockFs = createMockFileSystem(files, folders);
            
            const manager = new ContextManager(mockFs);
            const contextItem = await manager.addFile(filePath);
            
            // The context item should contain the file content
            if (contextItem.content !== fileContent) return false;
            if (contextItem.type !== 'file') return false;
            if (contextItem.path !== filePath) return false;
            
            // The active context should include this item
            const activeContext = manager.getActiveContext();
            return activeContext.some(item => item.content === fileContent);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 16: Folder context includes all markdown files**
   * 
   * *For any* folder selected as context, all markdown files within that folder 
   * should be included in the context.
   * 
   * **Validates: Requirements 5.4**
   */
  describe('Property 16: Folder context includes all markdown files', () => {
    it('should include all markdown files from folder in context', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 8 }),
              content: arbitraryFileContent(),
              isMarkdown: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (fileSpecs) => {
            const folderPath = 'testfolder';
            const files = new Map<string, string>();
            const folderChildren: string[] = [];
            
            // Create files with unique names
            const usedNames = new Set<string>();
            for (const spec of fileSpecs) {
              let name = spec.name;
              let counter = 0;
              while (usedNames.has(name)) {
                name = `${spec.name}${counter++}`;
              }
              usedNames.add(name);
              
              const ext = spec.isMarkdown ? '.md' : '.txt';
              const filePath = `${folderPath}/${name}${ext}`;
              files.set(filePath, spec.content);
              folderChildren.push(filePath);
            }
            
            const folders = new Map<string, string[]>([[folderPath, folderChildren]]);
            const mockFs = createMockFileSystem(files, folders);
            
            const manager = new ContextManager(mockFs);
            const addedItems = await manager.addFolder(folderPath);
            
            // Count expected markdown files
            const expectedMarkdownCount = fileSpecs.filter(s => s.isMarkdown).length;
            
            // All added items should be from markdown files
            if (addedItems.length !== expectedMarkdownCount) return false;
            
            // Each markdown file should be in the context
            for (const item of addedItems) {
              if (!item.path?.endsWith('.md')) return false;
              if (!files.has(item.path)) return false;
              if (item.content !== files.get(item.path)) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 18: Context removal excludes content**
   * 
   * *For any* removed context item, subsequent API requests should not include 
   * that item's content.
   * 
   * **Validates: Requirements 5.6**
   */
  describe('Property 18: Context removal excludes content', () => {
    it('should exclude removed context from active context and API format', () => {
      fc.assert(
        fc.property(
          // Use alphanumeric strings to avoid special characters that might appear in formatting
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 5, maxLength: 50 }),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 5, maxLength: 50 }),
          (content1: string, content2: string) => {
            // Ensure contents are different for clear testing
            if (content1 === content2) return true;
            // Ensure neither content is a substring of the other
            if (content1.includes(content2) || content2.includes(content1)) return true;
            
            const manager = new ContextManager();
            
            // Add two selections
            const item1 = manager.addSelection(content1);
            const item2 = manager.addSelection(content2);
            
            // Both should be in active context
            if (manager.getActiveContext().length !== 2) return false;
            if (!manager.hasContext(item1.id)) return false;
            if (!manager.hasContext(item2.id)) return false;
            
            // Remove the first item
            const removed = manager.removeContext(item1.id);
            if (!removed) return false;
            
            // First item should no longer be in context
            if (manager.hasContext(item1.id)) return false;
            if (manager.getActiveContext().length !== 1) return false;
            
            // API format should not include removed content but should include remaining content
            const apiFormat = manager.formatContextForAPI();
            if (apiFormat.includes(content1)) return false;
            if (!apiFormat.includes(content2)) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('ContextManager Unit Tests', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe('File path validation', () => {
    it('should reject empty paths', () => {
      expect(validateFilePath('')).toBe(false);
    });

    it('should reject paths with directory traversal', () => {
      expect(validateFilePath('../secret.md')).toBe(false);
      expect(validateFilePath('folder/../secret.md')).toBe(false);
      expect(validateFilePath('folder/../../secret.md')).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(validateFilePath('/etc/passwd')).toBe(false);
    });

    it('should accept valid relative paths', () => {
      expect(validateFilePath('notes/file.md')).toBe(true);
      expect(validateFilePath('file.md')).toBe(true);
      expect(validateFilePath('folder/subfolder/file.md')).toBe(true);
    });
  });

  describe('Markdown file detection', () => {
    it('should identify markdown files', () => {
      expect(isMarkdownFile('file.md')).toBe(true);
      expect(isMarkdownFile('file.MD')).toBe(true);
      expect(isMarkdownFile('folder/file.md')).toBe(true);
    });

    it('should reject non-markdown files', () => {
      expect(isMarkdownFile('file.txt')).toBe(false);
      expect(isMarkdownFile('file.js')).toBe(false);
      expect(isMarkdownFile('file')).toBe(false);
    });
  });

  describe('Selection handling', () => {
    it('should add selection as context', () => {
      const content = 'Selected text content';
      const item = manager.addSelection(content);
      
      expect(item.type).toBe('selection');
      expect(item.content).toBe(content);
      expect(item.displayName).toBe('Text selection');
    });

    it('should add selection with source path', () => {
      const content = 'Selected text';
      const sourcePath = 'notes/myfile.md';
      const item = manager.addSelection(content, sourcePath);
      
      expect(item.path).toBe(sourcePath);
      expect(item.displayName).toBe('Selection from myfile.md');
    });

    it('should reject empty selection', () => {
      expect(() => manager.addSelection('')).toThrow('Selection content cannot be empty');
      expect(() => manager.addSelection('   ')).toThrow('Selection content cannot be empty');
    });
  });

  describe('Context formatting', () => {
    it('should format file context correctly', () => {
      const formatted = formatFileContext('notes/test.md', 'File content here');
      expect(formatted).toContain('--- File: notes/test.md ---');
      expect(formatted).toContain('File content here');
      expect(formatted).toContain('--- End of notes/test.md ---');
    });

    it('should format selection as quoted block', () => {
      const formatted = formatSelectionContext('Line 1\nLine 2');
      expect(formatted).toBe('> Line 1\n> Line 2');
    });

    it('should return empty string when no context', () => {
      expect(manager.formatContextForAPI()).toBe('');
    });

    it('should format multiple context items for API', () => {
      manager.addSelection('Selection 1');
      manager.addSelection('Selection 2');
      
      const formatted = manager.formatContextForAPI();
      expect(formatted).toContain('The following context has been provided');
      expect(formatted).toContain('Selection 1');
      expect(formatted).toContain('Selection 2');
    });
  });

  describe('Context management', () => {
    it('should clear all context', () => {
      manager.addSelection('Text 1');
      manager.addSelection('Text 2');
      expect(manager.getContextCount()).toBe(2);
      
      manager.clearContext();
      expect(manager.getContextCount()).toBe(0);
    });

    it('should load context from saved state', () => {
      const savedItems: ContextItem[] = [
        { id: 'ctx-1', type: 'selection', content: 'Saved content', displayName: 'Saved' },
        { id: 'ctx-2', type: 'file', path: 'test.md', content: 'File content', displayName: 'test.md' },
      ];
      
      manager.loadContext(savedItems);
      
      expect(manager.getContextCount()).toBe(2);
      expect(manager.getContextItem('ctx-1')?.content).toBe('Saved content');
      expect(manager.getContextItem('ctx-2')?.path).toBe('test.md');
    });

    it('should export context for saving', () => {
      manager.addSelection('Content 1');
      manager.addSelection('Content 2');
      
      const exported = manager.exportContext();
      expect(exported.length).toBe(2);
      expect(exported.every(item => item.type === 'selection')).toBe(true);
    });
  });

  describe('File operations', () => {
    it('should throw error when file system not configured', async () => {
      await expect(manager.addFile('test.md')).rejects.toThrow('File system adapter not configured');
    });

    it('should throw error for invalid file path', async () => {
      const mockFs = createMockFileSystem(new Map(), new Map());
      manager.setFileSystem(mockFs);
      
      await expect(manager.addFile('../secret.md')).rejects.toThrow('Invalid file path');
    });

    it('should throw error when file not found', async () => {
      const mockFs = createMockFileSystem(new Map(), new Map());
      manager.setFileSystem(mockFs);
      
      await expect(manager.addFile('nonexistent.md')).rejects.toThrow('File not found');
    });

    it('should add file content to context', async () => {
      const files = new Map([['test.md', 'Test content']]);
      const mockFs = createMockFileSystem(files, new Map());
      manager.setFileSystem(mockFs);
      
      const item = await manager.addFile('test.md');
      
      expect(item.type).toBe('file');
      expect(item.content).toBe('Test content');
      expect(item.path).toBe('test.md');
    });
  });

  describe('Folder operations', () => {
    it('should throw error when folder not found', async () => {
      const mockFs = createMockFileSystem(new Map(), new Map());
      manager.setFileSystem(mockFs);
      
      await expect(manager.addFolder('nonexistent')).rejects.toThrow('Folder not found');
    });

    it('should add only markdown files from folder', async () => {
      const files = new Map([
        ['folder/file1.md', 'Content 1'],
        ['folder/file2.md', 'Content 2'],
        ['folder/file3.txt', 'Content 3'],
      ]);
      const folders = new Map([
        ['folder', ['folder/file1.md', 'folder/file2.md', 'folder/file3.txt']],
      ]);
      const mockFs = createMockFileSystem(files, folders);
      manager.setFileSystem(mockFs);
      
      const items = await manager.addFolder('folder');
      
      expect(items.length).toBe(2);
      expect(items.every(item => item.path?.endsWith('.md'))).toBe(true);
    });
  });
});
