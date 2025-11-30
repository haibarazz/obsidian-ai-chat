/**
 * Markdown Renderer for AI Chat Sidebar
 * Handles rendering of markdown content including LaTeX formulas
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { MarkdownRenderer as ObsidianMarkdownRenderer, Component, App } from 'obsidian';

/**
 * Interface for storing LaTeX source for copy functionality
 */
export interface LatexSourceMap {
  [elementId: string]: string;
}

/**
 * MarkdownRenderer class handles rendering of markdown content
 * including code blocks with syntax highlighting and LaTeX formulas
 * 
 * Requirements: 12.1 - Render headings, bold, italic, and other text formatting
 * Requirements: 12.2 - Render code blocks with syntax highlighting
 * Requirements: 12.3 - Render inline code with monospace styling
 * Requirements: 12.4 - Render LaTeX formulas as mathematical notation
 * Requirements: 12.5 - Render lists with proper indentation and markers
 * Requirements: 12.6 - Render links as clickable hyperlinks
 * Requirements: 12.7 - Render blockquotes with appropriate styling
 */
export class ChatMarkdownRenderer {
  private app: App;
  private component: Component;
  private latexSourceMap: LatexSourceMap = {};
  private latexIdCounter = 0;

  constructor(app: App, component: Component) {
    this.app = app;
    this.component = component;
  }

  /**
   * Renders markdown content to HTML in the specified container
   * Uses Obsidian's built-in MarkdownRenderer for full markdown support
   * 
   * Requirements: 12.1 - Render headings, bold, italic, and other text formatting
   * Requirements: 12.2 - Render code blocks with syntax highlighting
   * Requirements: 12.3 - Render inline code with monospace styling
   * Requirements: 12.5 - Render lists with proper indentation and markers
   * Requirements: 12.6 - Render links as clickable hyperlinks
   * Requirements: 12.7 - Render blockquotes with appropriate styling
   * 
   * @param content The markdown content to render
   * @param container The HTML element to render into
   * @param sourcePath Optional source path for resolving links
   */
  async render(content: string, container: HTMLElement, sourcePath?: string): Promise<void> {
    // Clear the container
    container.empty();
    
    // Add markdown-rendered class for styling
    container.addClass('ai-chat-markdown-rendered');

    // Use Obsidian's MarkdownRenderer to render the content
    // This handles all markdown syntax including:
    // - Headings (h1-h6)
    // - Bold, italic, strikethrough
    // - Code blocks with syntax highlighting
    // - Inline code
    // - Lists (ordered and unordered)
    // - Links
    // - Blockquotes
    // - LaTeX formulas (via MathJax)
    await ObsidianMarkdownRenderer.renderMarkdown(
      content,
      container,
      sourcePath || '',
      this.component
    );

    // Post-process to add copy buttons and store LaTeX sources
    this.postProcessCodeBlocks(container);
    this.postProcessLatexFormulas(container, content);
  }

  /**
   * Renders a code block with syntax highlighting
   * 
   * Requirements: 12.2 - Render code blocks with syntax highlighting
   * 
   * @param code The code content
   * @param language The programming language for syntax highlighting
   * @param container The HTML element to render into
   */
  renderCodeBlock(code: string, language: string, container: HTMLElement): void {
    // Create pre/code structure
    const preEl = container.createEl('pre', { cls: 'ai-chat-code-block' });
    const codeEl = preEl.createEl('code');
    
    // Add language class for syntax highlighting
    if (language) {
      codeEl.addClass(`language-${language}`);
      preEl.setAttribute('data-language', language);
    }
    
    codeEl.setText(code);
    
    // Store the code for copy functionality
    preEl.setAttribute('data-code', code);
  }

  /**
   * Renders a LaTeX formula
   * Uses Obsidian's built-in MathJax support
   * 
   * Requirements: 12.4 - Render LaTeX formulas as mathematical notation
   * 
   * @param formula The LaTeX formula (without delimiters)
   * @param container The HTML element to render into
   * @param displayMode Whether to render in display mode (block) or inline
   */
  async renderLatex(formula: string, container: HTMLElement, displayMode: boolean): Promise<void> {
    // Generate unique ID for this formula
    const formulaId = `latex-${++this.latexIdCounter}`;
    
    // Store the original LaTeX source for copy functionality
    this.latexSourceMap[formulaId] = formula;
    
    // Create wrapper element
    const wrapperEl = container.createDiv({
      cls: displayMode ? 'ai-chat-latex-display' : 'ai-chat-latex-inline',
    });
    wrapperEl.setAttribute('data-latex-id', formulaId);
    
    // Wrap formula with appropriate delimiters for Obsidian's renderer
    const wrappedFormula = displayMode ? `$$${formula}$$` : `$${formula}$`;
    
    // Use Obsidian's markdown renderer which includes MathJax support
    await ObsidianMarkdownRenderer.renderMarkdown(
      wrappedFormula,
      wrapperEl,
      '',
      this.component
    );
  }

  /**
   * Gets the original LaTeX source for a formula element
   * Used for copy functionality
   * 
   * @param elementId The formula element's data-latex-id
   * @returns The original LaTeX source or undefined
   */
  getLatexSource(elementId: string): string | undefined {
    return this.latexSourceMap[elementId];
  }

  /**
   * Clears the LaTeX source map
   * Should be called when the renderer is no longer needed
   */
  clearLatexSources(): void {
    this.latexSourceMap = {};
    this.latexIdCounter = 0;
  }

  /**
   * Post-processes code blocks to add data attributes for copy functionality
   * 
   * @param container The container with rendered markdown
   */
  private postProcessCodeBlocks(container: HTMLElement): void {
    // Find all code blocks (pre > code)
    const codeBlocks = container.querySelectorAll('pre > code');
    
    codeBlocks.forEach((codeEl) => {
      const preEl = codeEl.parentElement;
      if (preEl) {
        // Store the code content for copy functionality
        const codeContent = codeEl.textContent || '';
        preEl.setAttribute('data-code', codeContent);
        preEl.addClass('ai-chat-code-block');
      }
    });
  }

  /**
   * Post-processes LaTeX formulas to store original sources
   * Extracts LaTeX from the original content and maps to rendered elements
   * 
   * @param container The container with rendered markdown
   * @param originalContent The original markdown content
   */
  private postProcessLatexFormulas(container: HTMLElement, originalContent: string): void {
    // Extract LaTeX formulas from original content
    const displayLatexRegex = /\$\$([^$]+)\$\$/g;
    const inlineLatexRegex = /\$([^$\n]+)\$/g;
    
    // Find all MathJax rendered elements
    const mathElements = container.querySelectorAll('.math, .MathJax, mjx-container');
    
    // Extract display formulas
    const displayFormulas: string[] = [];
    let match;
    while ((match = displayLatexRegex.exec(originalContent)) !== null) {
      displayFormulas.push(match[1].trim());
    }
    
    // Extract inline formulas (excluding display formulas)
    const inlineFormulas: string[] = [];
    // Reset regex
    const contentWithoutDisplay = originalContent.replace(displayLatexRegex, '');
    while ((match = inlineLatexRegex.exec(contentWithoutDisplay)) !== null) {
      inlineFormulas.push(match[1].trim());
    }
    
    // Map formulas to elements
    let displayIndex = 0;
    let inlineIndex = 0;
    
    mathElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const formulaId = `latex-${++this.latexIdCounter}`;
      htmlEl.setAttribute('data-latex-id', formulaId);
      
      // Determine if display or inline based on element structure
      const isDisplay = htmlEl.classList.contains('math-display') || 
                       htmlEl.closest('.math-display') !== null ||
                       htmlEl.tagName === 'MJX-CONTAINER' && htmlEl.getAttribute('display') === 'true';
      
      if (isDisplay && displayIndex < displayFormulas.length) {
        this.latexSourceMap[formulaId] = displayFormulas[displayIndex++];
      } else if (!isDisplay && inlineIndex < inlineFormulas.length) {
        this.latexSourceMap[formulaId] = inlineFormulas[inlineIndex++];
      }
    });
  }
}

/**
 * Creates a ChatMarkdownRenderer instance
 * Factory function for easier instantiation
 * 
 * @param app The Obsidian App instance
 * @param component The Component for lifecycle management
 * @returns A new ChatMarkdownRenderer instance
 */
export function createMarkdownRenderer(app: App, component: Component): ChatMarkdownRenderer {
  return new ChatMarkdownRenderer(app, component);
}
