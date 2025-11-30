/**
 * Property-based tests and unit tests for LiveSelectionManager
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { LiveSelectionManager } from './live-selection';

/**
 * Arbitrary for generating non-empty selection text
 */
const arbitrarySelectionText = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/**
 * Arbitrary for generating valid file paths
 */
const arbitraryFilePath = (): fc.Arbitrary<string> =>
  fc.array(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'), { minLength: 1, maxLength: 10 }),
    { minLength: 1, maxLength: 4 }
  ).map(parts => parts.join('/') + '.md');

/**
 * Arbitrary for generating whitespace-only strings
 */
const arbitraryWhitespaceOnly = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 10 });

describe('LiveSelectionManager Property Tests', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 36: Live selection tracking**
   * 
   * *For any* text selection in the editor, the live selection context should 
   * reflect the current selection, and clearing the selection should remove 
   * the live selection indicator.
   * 
   * **Validates: Requirements 11.1, 11.4, 11.5**
   */
  describe('Property 36: Live selection tracking', () => {
    it('should track selection and reflect current selection content', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          fc.option(arbitraryFilePath(), { nil: undefined }),
          (content, sourcePath) => {
            const manager = new LiveSelectionManager();
            
            // Set selection
            manager.setSelection(content, sourcePath);
            
            // Selection should be tracked
            if (!manager.hasSelection()) return false;
            
            // Content should match
            const selection = manager.getSelection();
            if (!selection) return false;
            if (selection.content !== content) return false;
            if (selection.sourcePath !== sourcePath) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update selection when changed', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          arbitrarySelectionText(),
          (content1, content2) => {
            // Ensure different content for meaningful test
            if (content1 === content2) return true;
            
            const manager = new LiveSelectionManager();
            
            // Set first selection
            manager.setSelection(content1);
            if (manager.getContent() !== content1) return false;
            
            // Update to second selection
            manager.setSelection(content2);
            if (manager.getContent() !== content2) return false;
            
            // Only one selection should exist
            if (!manager.hasSelection()) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should remove selection indicator when cleared', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          (content) => {
            const manager = new LiveSelectionManager();
            
            // Set selection
            manager.setSelection(content);
            if (!manager.hasSelection()) return false;
            
            // Clear selection
            manager.clearSelection();
            
            // Selection should be removed
            if (manager.hasSelection()) return false;
            if (manager.getSelection() !== null) return false;
            if (manager.getContent() !== '') return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should treat empty/whitespace-only content as clearing selection', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          arbitraryWhitespaceOnly(),
          (validContent, whitespaceContent) => {
            const manager = new LiveSelectionManager();
            
            // Set valid selection first
            manager.setSelection(validContent);
            if (!manager.hasSelection()) return false;
            
            // Setting whitespace-only content should clear selection
            manager.setSelection(whitespaceContent);
            if (manager.hasSelection()) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 37: Live selection indicator display**
   * 
   * *For any* active text selection, the chat interface should display a live 
   * selection indicator (eye icon) with a preview of the selected content.
   * 
   * **Validates: Requirements 11.2, 11.3**
   */
  describe('Property 37: Live selection indicator display', () => {
    it('should provide preview for any active selection', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          fc.option(arbitraryFilePath(), { nil: undefined }),
          (content, sourcePath) => {
            const manager = new LiveSelectionManager();
            
            // Set selection
            manager.setSelection(content, sourcePath);
            
            // Should have selection indicator (hasSelection returns true)
            if (!manager.hasSelection()) return false;
            
            // Preview should be non-empty for any valid selection
            const preview = manager.getPreview();
            if (preview.length === 0) return false;
            
            // Preview should be a prefix of content (possibly truncated)
            const previewWithoutEllipsis = preview.endsWith('...') 
              ? preview.slice(0, -3) 
              : preview;
            if (!content.startsWith(previewWithoutEllipsis)) return false;
            
            // Source path should be accessible if provided
            if (sourcePath !== undefined && manager.getSourcePath() !== sourcePath) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not display indicator when no selection exists', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          (content) => {
            const manager = new LiveSelectionManager();
            
            // Initially no selection
            if (manager.hasSelection()) return false;
            if (manager.getPreview() !== '') return false;
            
            // Set and then clear selection
            manager.setSelection(content);
            manager.clearSelection();
            
            // Should not display indicator after clearing
            if (manager.hasSelection()) return false;
            if (manager.getPreview() !== '') return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should truncate long selections in preview', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 101, max: 500 }),
          (length) => {
            const manager = new LiveSelectionManager();
            const longContent = 'A'.repeat(length);
            
            manager.setSelection(longContent);
            
            // Preview should be truncated to max length (default 100)
            const preview = manager.getPreview();
            if (preview.length !== 100) return false;
            if (!preview.endsWith('...')) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 38: Live selection in API request**
   * 
   * *For any* message sent with an active live selection, the API request 
   * should include the selected text content.
   * 
   * **Validates: Requirements 11.6**
   */
  describe('Property 38: Live selection in API request', () => {
    it('should format live selection for API inclusion', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          fc.option(arbitraryFilePath(), { nil: undefined }),
          (content, sourcePath) => {
            const manager = new LiveSelectionManager();
            
            // Set selection
            manager.setSelection(content, sourcePath);
            
            // Format for API should include the content
            const apiFormat = manager.formatForAPI();
            
            // API format should contain the selection content
            if (!apiFormat.includes(content)) return false;
            
            // API format should indicate it's a live selection
            if (!apiFormat.includes('Live Selection')) return false;
            
            // If source path provided, it should be included
            if (sourcePath !== undefined && !apiFormat.includes(sourcePath)) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty string for API when no selection', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          (content) => {
            const manager = new LiveSelectionManager();
            
            // No selection - API format should be empty
            if (manager.formatForAPI() !== '') return false;
            
            // Set and clear selection
            manager.setSelection(content);
            manager.clearSelection();
            
            // After clearing, API format should be empty
            if (manager.formatForAPI() !== '') return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 39: Live selection is temporary**
   * 
   * *For any* message sent with live selection context, the live selection 
   * should NOT be persisted as a permanent context item in the session.
   * 
   * **Validates: Requirements 11.7**
   */
  describe('Property 39: Live selection is temporary', () => {
    it('should not persist live selection - manager has no persistence methods', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          fc.option(arbitraryFilePath(), { nil: undefined }),
          (content, sourcePath) => {
            const manager = new LiveSelectionManager();
            
            // Set selection
            manager.setSelection(content, sourcePath);
            
            // LiveSelectionManager should NOT have any persistence methods
            // This is by design - live selection is temporary and in-memory only
            // The manager does not have loadState/saveState methods
            
            // Verify the selection exists only in memory
            if (!manager.hasSelection()) return false;
            
            // Creating a new manager should have no selection (not persisted)
            const newManager = new LiveSelectionManager();
            if (newManager.hasSelection()) return false;
            
            // The selection should be independent per manager instance
            if (newManager.getSelection() !== null) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be cleared independently of permanent context', () => {
      fc.assert(
        fc.property(
          arbitrarySelectionText(),
          arbitrarySelectionText(),
          (liveContent, permanentContent) => {
            // Ensure different content
            if (liveContent === permanentContent) return true;
            
            const manager = new LiveSelectionManager();
            
            // Set live selection
            manager.setSelection(liveContent);
            
            // Live selection should be clearable without affecting anything else
            manager.clearSelection();
            
            // After clearing, no selection should exist
            if (manager.hasSelection()) return false;
            if (manager.getContent() !== '') return false;
            
            // Can set a new selection after clearing
            manager.setSelection(permanentContent);
            if (!manager.hasSelection()) return false;
            if (manager.getContent() !== permanentContent) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not accumulate selections - only one at a time', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySelectionText(), { minLength: 2, maxLength: 5 }),
          (contents) => {
            const manager = new LiveSelectionManager();
            
            // Set multiple selections in sequence
            for (const content of contents) {
              manager.setSelection(content);
            }
            
            // Only the last selection should be present
            const lastContent = contents[contents.length - 1];
            if (manager.getContent() !== lastContent) return false;
            
            // There should be exactly one selection (not accumulated)
            if (!manager.hasSelection()) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('LiveSelectionManager Unit Tests', () => {
  let manager: LiveSelectionManager;

  beforeEach(() => {
    manager = new LiveSelectionManager();
  });

  describe('setSelection', () => {
    it('should set selection with content only', () => {
      manager.setSelection('Test content');
      
      expect(manager.hasSelection()).toBe(true);
      expect(manager.getContent()).toBe('Test content');
      expect(manager.getSourcePath()).toBeUndefined();
    });

    it('should set selection with content and source path', () => {
      manager.setSelection('Test content', 'notes/file.md');
      
      expect(manager.hasSelection()).toBe(true);
      expect(manager.getContent()).toBe('Test content');
      expect(manager.getSourcePath()).toBe('notes/file.md');
    });

    it('should update timestamp on each set', () => {
      manager.setSelection('Content 1');
      const timestamp1 = manager.getSelection()?.timestamp;
      
      // Small delay to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 5) { /* wait */ }
      
      manager.setSelection('Content 2');
      const timestamp2 = manager.getSelection()?.timestamp;
      
      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1!);
    });

    it('should clear selection when setting empty content', () => {
      manager.setSelection('Valid content');
      expect(manager.hasSelection()).toBe(true);
      
      manager.setSelection('');
      expect(manager.hasSelection()).toBe(false);
    });

    it('should clear selection when setting whitespace-only content', () => {
      manager.setSelection('Valid content');
      expect(manager.hasSelection()).toBe(true);
      
      manager.setSelection('   \t\n  ');
      expect(manager.hasSelection()).toBe(false);
    });
  });

  describe('clearSelection', () => {
    it('should clear existing selection', () => {
      manager.setSelection('Test content');
      expect(manager.hasSelection()).toBe(true);
      
      manager.clearSelection();
      
      expect(manager.hasSelection()).toBe(false);
      expect(manager.getSelection()).toBeNull();
    });

    it('should be safe to call when no selection exists', () => {
      expect(manager.hasSelection()).toBe(false);
      
      // Should not throw
      manager.clearSelection();
      
      expect(manager.hasSelection()).toBe(false);
    });
  });

  describe('getSelection', () => {
    it('should return null when no selection', () => {
      expect(manager.getSelection()).toBeNull();
    });

    it('should return selection object with all properties', () => {
      manager.setSelection('Content', 'path/file.md');
      
      const selection = manager.getSelection();
      
      expect(selection).not.toBeNull();
      expect(selection?.content).toBe('Content');
      expect(selection?.sourcePath).toBe('path/file.md');
      expect(selection?.timestamp).toBeGreaterThan(0);
    });
  });

  describe('hasSelection', () => {
    it('should return false initially', () => {
      expect(manager.hasSelection()).toBe(false);
    });

    it('should return true after setting selection', () => {
      manager.setSelection('Content');
      expect(manager.hasSelection()).toBe(true);
    });

    it('should return false after clearing selection', () => {
      manager.setSelection('Content');
      manager.clearSelection();
      expect(manager.hasSelection()).toBe(false);
    });
  });

  describe('getPreview', () => {
    it('should return empty string when no selection', () => {
      expect(manager.getPreview()).toBe('');
    });

    it('should return full content when shorter than max length', () => {
      manager.setSelection('Short text');
      expect(manager.getPreview(100)).toBe('Short text');
    });

    it('should truncate content when longer than max length', () => {
      const longContent = 'A'.repeat(150);
      manager.setSelection(longContent);
      
      const preview = manager.getPreview(100);
      
      expect(preview.length).toBe(100);
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should use default max length of 100', () => {
      const longContent = 'A'.repeat(150);
      manager.setSelection(longContent);
      
      const preview = manager.getPreview();
      
      expect(preview.length).toBe(100);
    });
  });

  describe('formatForAPI', () => {
    it('should return empty string when no selection', () => {
      expect(manager.formatForAPI()).toBe('');
    });

    it('should format selection without source path', () => {
      manager.setSelection('Selected text');
      
      const formatted = manager.formatForAPI();
      
      expect(formatted).toBe('[Live Selection]\nSelected text');
    });

    it('should format selection with source path', () => {
      manager.setSelection('Selected text', 'notes/file.md');
      
      const formatted = manager.formatForAPI();
      
      expect(formatted).toBe('[Live Selection (from notes/file.md)]\nSelected text');
    });
  });

  describe('onChange callback', () => {
    it('should call callback when selection is set', () => {
      const callback = vi.fn();
      manager.setOnChangeCallback(callback);
      
      manager.setSelection('Content');
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback when selection is cleared', () => {
      const callback = vi.fn();
      manager.setSelection('Content');
      
      manager.setOnChangeCallback(callback);
      manager.clearSelection();
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not call callback when clearing empty selection', () => {
      const callback = vi.fn();
      manager.setOnChangeCallback(callback);
      
      manager.clearSelection();
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should call callback when selection is updated', () => {
      const callback = vi.fn();
      manager.setOnChangeCallback(callback);
      
      manager.setSelection('Content 1');
      manager.setSelection('Content 2');
      
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should allow removing callback', () => {
      const callback = vi.fn();
      manager.setOnChangeCallback(callback);
      manager.setOnChangeCallback(null);
      
      manager.setSelection('Content');
      
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
