/**
 * Copy Manager for AI Chat Sidebar
 * Handles clipboard operations with visual feedback
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7
 */

import { setIcon, Notice } from 'obsidian';

/**
 * CopyManager class handles clipboard operations with visual feedback
 * 
 * Requirements: 13.1 - Show a copy button on the message container
 * Requirements: 13.2 - Copy the entire message content to the clipboard
 * Requirements: 13.3 - Display a brief visual confirmation
 */
export class CopyManager {
  private confirmationTimeout = 2000; // 2 seconds

  /**
   * Copies content to the clipboard
   * Uses navigator.clipboard API with fallback
   * 
   * Requirements: 13.2 - Copy the entire message content to the clipboard
   * Requirements: 13.5 - Copy only the code content to the clipboard
   * Requirements: 13.7 - Copy the LaTeX source code to the clipboard
   * 
   * @param content The content to copy
   * @returns Promise<boolean> indicating success
   */
  async copyToClipboard(content: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch (error) {
      // Fallback for older browsers or restricted contexts
      try {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      } catch (fallbackError) {
        console.error('Failed to copy to clipboard:', fallbackError);
        new Notice('Failed to copy to clipboard');
        return false;
      }
    }
  }

  /**
   * Shows visual confirmation on a copy button
   * Changes icon from "copy" to "check" temporarily
   * 
   * Requirements: 13.3 - Display a brief visual confirmation (icon change or tooltip)
   * 
   * @param button The button element to show confirmation on
   */
  showCopyConfirmation(button: HTMLElement): void {
    // Store original icon
    const originalIcon = button.getAttribute('data-original-icon') || 'copy';
    
    // Change to check icon
    button.empty();
    setIcon(button, 'check');
    button.addClass('ai-chat-copy-success');
    
    // Revert after timeout
    setTimeout(() => {
      button.empty();
      setIcon(button, originalIcon);
      button.removeClass('ai-chat-copy-success');
    }, this.confirmationTimeout);
  }

  /**
   * Creates a copy button element
   * 
   * @param onClick Callback when button is clicked
   * @param ariaLabel Accessibility label for the button
   * @returns The created button element
   */
  createCopyButton(onClick: () => void, ariaLabel: string = 'Copy'): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'ai-chat-copy-btn';
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('title', ariaLabel);
    button.setAttribute('data-original-icon', 'copy');
    setIcon(button, 'copy');
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    
    return button;
  }

  /**
   * Adds a copy button to a message container
   * 
   * Requirements: 13.1 - Show a copy button on the message container
   * Requirements: 13.2 - Copy the entire message content to the clipboard
   * 
   * @param messageEl The message container element
   * @param content The content to copy when button is clicked
   */
  addMessageCopyButton(messageEl: HTMLElement, content: string): void {
    // Check if button already exists
    if (messageEl.querySelector('.ai-chat-message-copy-btn')) {
      return;
    }

    const button = this.createCopyButton(
      async () => {
        const success = await this.copyToClipboard(content);
        if (success) {
          this.showCopyConfirmation(button);
        }
      },
      'Copy message'
    );
    button.classList.add('ai-chat-message-copy-btn');
    
    // Add to message element directly (positioned at bottom-right via CSS)
    // 直接添加到消息容器，通过 CSS 定位到右下角
    messageEl.appendChild(button);
  }

  /**
   * Adds copy buttons to all code blocks in a container
   * 
   * Requirements: 13.4 - Display a copy button on the code block
   * Requirements: 13.5 - Copy only the code content to the clipboard
   * 
   * @param container The container with code blocks
   */
  addCodeBlockCopyButtons(container: HTMLElement): void {
    const codeBlocks = container.querySelectorAll('pre.ai-chat-code-block, pre:has(> code)');
    
    codeBlocks.forEach((preEl) => {
      // Check if button already exists
      if (preEl.querySelector('.ai-chat-code-copy-btn')) {
        return;
      }

      const htmlPreEl = preEl as HTMLElement;
      
      // Get code content from data attribute or code element
      let codeContent = htmlPreEl.getAttribute('data-code');
      if (!codeContent) {
        const codeEl = htmlPreEl.querySelector('code');
        codeContent = codeEl?.textContent || '';
      }

      // Create wrapper for positioning
      const wrapper = document.createElement('div');
      wrapper.className = 'ai-chat-code-block-wrapper';
      htmlPreEl.parentNode?.insertBefore(wrapper, htmlPreEl);
      wrapper.appendChild(htmlPreEl);

      const button = this.createCopyButton(
        async () => {
          const success = await this.copyToClipboard(codeContent || '');
          if (success) {
            this.showCopyConfirmation(button);
          }
        },
        'Copy code'
      );
      button.classList.add('ai-chat-code-copy-btn');
      
      wrapper.appendChild(button);
    });
  }

  /**
   * Adds copy buttons to all LaTeX formula blocks in a container
   * 
   * Requirements: 13.6 - Display a copy button to copy the LaTeX source
   * Requirements: 13.7 - Copy the LaTeX source code to the clipboard
   * 
   * @param container The container with LaTeX formulas
   * @param getLatexSource Function to get LaTeX source by element ID
   */
  addLatexCopyButtons(
    container: HTMLElement, 
    getLatexSource: (elementId: string) => string | undefined
  ): void {
    // Find all LaTeX elements (MathJax rendered elements)
    const latexElements = container.querySelectorAll(
      '.math-display, .MathJax_Display, mjx-container[display="true"], ' +
      '.ai-chat-latex-display, [data-latex-id]'
    );
    
    latexElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      
      // Check if button already exists
      if (htmlEl.querySelector('.ai-chat-latex-copy-btn') || 
          htmlEl.parentElement?.querySelector('.ai-chat-latex-copy-btn')) {
        return;
      }

      // Get LaTeX source from data attribute or callback
      const latexId = htmlEl.getAttribute('data-latex-id');
      let latexSource: string | undefined;
      
      if (latexId) {
        latexSource = getLatexSource(latexId);
      }
      
      // If no source found via ID, try to extract from element
      if (!latexSource) {
        latexSource = htmlEl.getAttribute('data-latex-source') || undefined;
      }

      // Only add button if we have source
      if (!latexSource) {
        return;
      }

      // Create wrapper for positioning
      const wrapper = document.createElement('div');
      wrapper.className = 'ai-chat-latex-wrapper';
      htmlEl.parentNode?.insertBefore(wrapper, htmlEl);
      wrapper.appendChild(htmlEl);

      const button = this.createCopyButton(
        async () => {
          const success = await this.copyToClipboard(latexSource || '');
          if (success) {
            this.showCopyConfirmation(button);
          }
        },
        'Copy LaTeX'
      );
      button.classList.add('ai-chat-latex-copy-btn');
      
      wrapper.appendChild(button);
    });
  }

  /**
   * Processes a container to add all copy buttons
   * Convenience method that adds message, code, and LaTeX copy buttons
   * 
   * @param messageEl The message element
   * @param content The message content for the message copy button
   * @param getLatexSource Function to get LaTeX source by element ID
   */
  processMessageForCopyButtons(
    messageEl: HTMLElement,
    content: string,
    getLatexSource: (elementId: string) => string | undefined
  ): void {
    // Add message copy button
    this.addMessageCopyButton(messageEl, content);
    
    // Add code block copy buttons
    const contentEl = messageEl.querySelector('.ai-chat-message-content');
    if (contentEl) {
      this.addCodeBlockCopyButtons(contentEl as HTMLElement);
      this.addLatexCopyButtons(contentEl as HTMLElement, getLatexSource);
    }
  }
}

/**
 * Creates a CopyManager instance
 * Factory function for easier instantiation
 * 
 * @returns A new CopyManager instance
 */
export function createCopyManager(): CopyManager {
  return new CopyManager();
}
