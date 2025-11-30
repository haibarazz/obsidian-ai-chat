/**
 * Live Selection Manager for the AI Chat Sidebar plugin
 * Manages temporary live selection context that tracks the user's current text selection
 * 
 * Requirements: 11.1, 11.4, 11.5
 * - 11.1: WHEN the user selects text in the editor THEN the Plugin SHALL automatically detect and track the selection
 * - 11.4: WHEN the user changes the text selection THEN the Plugin SHALL update the live selection context
 * - 11.5: WHEN the user clears the text selection THEN the Plugin SHALL remove the live selection indicator
 */

import type { LiveSelection } from '../types';

/**
 * LiveSelectionManager class handles temporary live selection context
 * The live selection is NOT persisted to disk and is automatically cleared when selection is cleared
 */
export class LiveSelectionManager {
  private currentSelection: LiveSelection | null = null;
  private onChangeCallback: (() => void) | null = null;

  /**
   * Sets the current live selection
   * Requirements: 11.1 - Automatically detect and track the selection
   * Requirements: 11.4 - Update the live selection context when selection changes
   * 
   * @param content - The selected text content
   * @param sourcePath - Optional path of the source file
   */
  setSelection(content: string, sourcePath?: string): void {
    // Don't set empty selections
    if (!content || content.trim().length === 0) {
      this.clearSelection();
      return;
    }

    this.currentSelection = {
      content,
      sourcePath,
      timestamp: Date.now(),
    };

    // Notify listeners of the change
    this.notifyChange();
  }

  /**
   * Clears the current live selection
   * Requirements: 11.5 - Remove the live selection indicator when selection is cleared
   */
  clearSelection(): void {
    const hadSelection = this.currentSelection !== null;
    this.currentSelection = null;

    // Only notify if there was actually a selection to clear
    if (hadSelection) {
      this.notifyChange();
    }
  }

  /**
   * Gets the current live selection
   * @returns The current live selection or null if none exists
   */
  getSelection(): LiveSelection | null {
    return this.currentSelection;
  }

  /**
   * Checks if there is an active live selection
   * @returns true if there is an active selection, false otherwise
   */
  hasSelection(): boolean {
    return this.currentSelection !== null;
  }

  /**
   * Gets the content of the current selection
   * @returns The selection content or empty string if no selection
   */
  getContent(): string {
    return this.currentSelection?.content ?? '';
  }

  /**
   * Gets the source path of the current selection
   * @returns The source path or undefined if no selection or no path
   */
  getSourcePath(): string | undefined {
    return this.currentSelection?.sourcePath;
  }

  /**
   * Sets a callback to be called when the selection changes
   * @param callback - Function to call on selection change
   */
  setOnChangeCallback(callback: (() => void) | null): void {
    this.onChangeCallback = callback;
  }

  /**
   * Notifies listeners that the selection has changed
   */
  private notifyChange(): void {
    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }

  /**
   * Formats the live selection for display (truncated preview)
   * @param maxLength - Maximum length of the preview (default 100)
   * @returns Truncated preview string
   */
  getPreview(maxLength: number = 100): string {
    if (!this.currentSelection) {
      return '';
    }

    const content = this.currentSelection.content;
    if (content.length <= maxLength) {
      return content;
    }

    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * Formats the live selection for API requests
   * Requirements: 11.6 - Include the selected text in the API request
   * @returns Formatted string for API context
   */
  formatForAPI(): string {
    if (!this.currentSelection) {
      return '';
    }

    const sourcePart = this.currentSelection.sourcePath 
      ? ` (from ${this.currentSelection.sourcePath})`
      : '';
    
    return `[Live Selection${sourcePart}]\n${this.currentSelection.content}`;
  }
}
