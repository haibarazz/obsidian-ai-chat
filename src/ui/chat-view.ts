/**
 * Chat View UI Component for the AI Chat Sidebar plugin
 * Extends Obsidian's ItemView to provide a chat interface in the sidebar
 * 
 * Requirements: 1.1, 1.2, 4.1, 4.4, 5.1, 5.5, 7.3
 * Requirements: 4.2, 4.3, 5.2, 5.6, 5.7, 6.5, 7.1, 7.2, 7.4, 7.6, 7.7
 */

import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import { VIEW_TYPE_CHAT, PLUGIN_NAME } from '../constants';
import type { AIModel, ChatMessage, ContextItem } from '../types';

/**
 * Interface for ChatView dependencies
 * Requirements: 4.2 - Model selector shows enabled models
 * Requirements: 4.3 - Model selection affects subsequent messages
 * Requirements: 5.7 - Message includes active context
 */
export interface ChatViewDependencies {
  getAvailableModels: () => AIModel[];
  getCurrentModelId: () => string | null;
  getMessages: () => ChatMessage[];
  getContextItems: () => ContextItem[];
  getAllSessions: () => Array<{ id: string; createdAt: number; updatedAt: number; messageCount: number }>;
  getCurrentSessionId: () => string | null;
  onSendMessage: (content: string) => Promise<void>;
  onSendMessageStream: (content: string, onChunk: (chunk: string) => void) => Promise<void>;
  onModelChange: (modelId: string) => void;
  onRemoveContext: (contextId: string) => void;
  onAddFileContext: () => Promise<void>;
  onAddFolderContext: () => Promise<void>;
  onNewSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isStreamingEnabled: () => boolean;
}

/**
 * ChatView class extends ItemView to provide the chat interface
 * Requirements: 1.1 - WHEN the user activates the AI chat command THEN the Plugin SHALL display the AI Chat Sidebar
 * Requirements: 1.2 - WHEN the AI Chat Sidebar is opened THEN the Plugin SHALL display a chat interface with message history and input area
 */
export class ChatView extends ItemView {
  private dependencies: ChatViewDependencies | null = null;
  
  // DOM elements
  private rootEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private modelSelectorEl: HTMLSelectElement | null = null;
  private sessionsAreaEl: HTMLElement | null = null;
  private messagesContainerEl: HTMLElement | null = null;
  private contextAreaEl: HTMLElement | null = null;
  private inputAreaEl: HTMLElement | null = null;
  private inputTextareaEl: HTMLTextAreaElement | null = null;
  private sendButtonEl: HTMLButtonElement | null = null;
  private loadingIndicatorEl: HTMLElement | null = null;
  private errorDisplayEl: HTMLElement | null = null;

  // State
  private isLoading = false;
  private errorMessage: string | null = null;
  private streamingMessageEl: HTMLElement | null = null;
  private isHistoryExpanded = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  /**
   * Returns the unique view type identifier
   */
  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  /**
   * Returns the display text for the view tab
   */
  getDisplayText(): string {
    return PLUGIN_NAME;
  }

  /**
   * Returns the icon for the view tab
   */
  getIcon(): string {
    return 'message-square';
  }

  /**
   * Sets the dependencies for the chat view
   */
  setDependencies(deps: ChatViewDependencies): void {
    this.dependencies = deps;
  }

  /**
   * Initializes the view when opened
   * Requirements: 1.2 - Display a chat interface with message history and input area
   */
  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl;
    this.rootEl.empty();
    this.rootEl.addClass('ai-chat-sidebar');

    this.createHeader();
    this.createSessionsArea();
    this.createContextArea();
    this.createMessagesContainer();
    this.createInputArea();
    this.createLoadingIndicator();
    this.createErrorDisplay();

    // Initial render
    this.refresh();
  }

  /**
   * Cleanup when view is closed
   */
  async onClose(): Promise<void> {
    this.rootEl?.empty();
  }

  /**
   * Creates the header section with model selector and new session button
   * Requirements: 4.1 - WHEN the chat interface is displayed THEN the Plugin SHALL show a model selector dropdown
   * Requirements: 4.4 - WHEN a model is selected THEN the Plugin SHALL display the current model name prominently
   */
  private createHeader(): void {
    if (!this.rootEl) return;

    this.headerEl = this.rootEl.createDiv({ cls: 'ai-chat-header' });
    
    // Title row with new session button
    const titleRow = this.headerEl.createDiv({ cls: 'ai-chat-title-row' });
    
    const titleEl = titleRow.createDiv({ cls: 'ai-chat-title' });
    titleEl.setText('AI Chat');

    // Header buttons container
    const headerBtns = titleRow.createDiv({ cls: 'ai-chat-header-btns' });

    // History toggle button
    const historyBtn = headerBtns.createEl('button', { cls: 'ai-chat-history-btn' });
    setIcon(historyBtn, 'history');
    historyBtn.setAttribute('aria-label', 'Chat history');
    historyBtn.setAttribute('title', 'Chat history');
    historyBtn.addEventListener('click', () => this.toggleHistory());

    // New session button
    const newSessionBtn = headerBtns.createEl('button', { cls: 'ai-chat-new-session-btn' });
    setIcon(newSessionBtn, 'plus');
    newSessionBtn.setAttribute('aria-label', 'New chat session');
    newSessionBtn.setAttribute('title', 'New chat session');
    newSessionBtn.addEventListener('click', () => this.handleNewSession());

    // Model selector container
    const modelSelectorContainer = this.headerEl.createDiv({ cls: 'ai-chat-model-selector-container' });
    
    const modelLabel = modelSelectorContainer.createSpan({ cls: 'ai-chat-model-label' });
    modelLabel.setText('Model:');

    this.modelSelectorEl = modelSelectorContainer.createEl('select', { cls: 'ai-chat-model-selector' });
    this.modelSelectorEl.addEventListener('change', () => this.handleModelChange());
  }

  /**
   * Creates the sessions area for displaying chat history (collapsible)
   */
  private createSessionsArea(): void {
    if (!this.rootEl) return;

    this.sessionsAreaEl = this.rootEl.createDiv({ cls: 'ai-chat-sessions-area ai-chat-sessions-collapsed' });
    
    // Sessions header
    const sessionsHeader = this.sessionsAreaEl.createDiv({ cls: 'ai-chat-sessions-header' });
    
    const sessionsLabel = sessionsHeader.createSpan({ cls: 'ai-chat-sessions-label' });
    sessionsLabel.setText('Chat History');

    // Sessions list container
    this.sessionsAreaEl.createDiv({ cls: 'ai-chat-sessions-list' });
  }

  /**
   * Toggles the history panel visibility
   */
  private toggleHistory(): void {
    this.isHistoryExpanded = !this.isHistoryExpanded;
    
    if (this.sessionsAreaEl) {
      if (this.isHistoryExpanded) {
        this.sessionsAreaEl.removeClass('ai-chat-sessions-collapsed');
        this.sessionsAreaEl.addClass('ai-chat-sessions-expanded');
      } else {
        this.sessionsAreaEl.removeClass('ai-chat-sessions-expanded');
        this.sessionsAreaEl.addClass('ai-chat-sessions-collapsed');
      }
    }
  }

  /**
   * Creates the context items display area
   * Requirements: 5.1 - WHEN the chat interface is displayed THEN the Plugin SHALL provide a button to add context items
   * Requirements: 5.2 - WHEN the user clicks the add context button THEN the Plugin SHALL display a file and folder picker
   * Requirements: 5.5 - WHEN context items are added THEN the Plugin SHALL display them as removable tags
   */
  private createContextArea(): void {
    if (!this.rootEl) return;

    this.contextAreaEl = this.rootEl.createDiv({ cls: 'ai-chat-context-area' });
    
    // Context header with add button
    const contextHeader = this.contextAreaEl.createDiv({ cls: 'ai-chat-context-header' });
    
    const contextLabel = contextHeader.createSpan({ cls: 'ai-chat-context-label' });
    contextLabel.setText('Context');

    const addContextBtn = contextHeader.createEl('button', { cls: 'ai-chat-add-context-btn' });
    setIcon(addContextBtn, 'plus');
    addContextBtn.setAttribute('aria-label', 'Add context');
    addContextBtn.addEventListener('click', (event) => this.showContextMenu(event));

    // Context items container
    this.contextAreaEl.createDiv({ cls: 'ai-chat-context-items' });
  }

  /**
   * Shows a context menu for adding file or folder context
   * Requirements: 5.2 - WHEN the user clicks the add context button THEN the Plugin SHALL display a file and folder picker
   */
  private showContextMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Add file')
        .setIcon('file-text')
        .onClick(() => this.handleAddFileContext());
    });

    menu.addItem((item) => {
      item
        .setTitle('Add folder')
        .setIcon('folder')
        .onClick(() => this.handleAddFolderContext());
    });

    menu.showAtMouseEvent(event);
  }

  /**
   * Creates the messages container for chat history
   * Requirements: 7.3 - WHEN the API request is in progress THEN the Plugin SHALL display a loading indicator
   */
  private createMessagesContainer(): void {
    if (!this.rootEl) return;

    this.messagesContainerEl = this.rootEl.createDiv({ cls: 'ai-chat-messages' });
  }

  /**
   * Creates the input area with textarea and send button
   */
  private createInputArea(): void {
    if (!this.rootEl) return;

    this.inputAreaEl = this.rootEl.createDiv({ cls: 'ai-chat-input-area' });

    // Textarea for message input
    this.inputTextareaEl = this.inputAreaEl.createEl('textarea', {
      cls: 'ai-chat-input',
      attr: {
        placeholder: 'Type your message...',
        rows: '3',
      },
    });
    this.inputTextareaEl.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Send button
    this.sendButtonEl = this.inputAreaEl.createEl('button', { cls: 'ai-chat-send-btn' });
    setIcon(this.sendButtonEl, 'send');
    this.sendButtonEl.setAttribute('aria-label', 'Send message');
    this.sendButtonEl.addEventListener('click', () => this.handleSendMessage());
  }

  /**
   * Creates the loading indicator
   * Requirements: 7.3 - WHEN the API request is in progress THEN the Plugin SHALL display a loading indicator
   */
  private createLoadingIndicator(): void {
    if (!this.rootEl) return;

    this.loadingIndicatorEl = this.rootEl.createDiv({ cls: 'ai-chat-loading' });
    this.loadingIndicatorEl.style.display = 'none';
    
    this.loadingIndicatorEl.createDiv({ cls: 'ai-chat-spinner' });
    const loadingText = this.loadingIndicatorEl.createSpan();
    loadingText.setText('Thinking...');
  }

  /**
   * Creates the error display area
   */
  private createErrorDisplay(): void {
    if (!this.rootEl) return;

    this.errorDisplayEl = this.rootEl.createDiv({ cls: 'ai-chat-error' });
    this.errorDisplayEl.style.display = 'none';
  }

  /**
   * Refreshes the entire view
   */
  refresh(): void {
    this.renderModelSelector();
    this.renderSessions();
    this.renderContextItems();
    this.renderMessages();
    this.updateLoadingState();
    this.updateErrorDisplay();
  }

  /**
   * Renders the model selector dropdown
   * Requirements: 4.1 - Show a model selector dropdown
   * Requirements: 4.4 - Display the current model name prominently
   */
  renderModelSelector(): void {
    if (!this.modelSelectorEl || !this.dependencies) return;

    const models = this.dependencies.getAvailableModels();
    const currentModelId = this.dependencies.getCurrentModelId();

    // Clear existing options
    this.modelSelectorEl.empty();

    if (models.length === 0) {
      const option = this.modelSelectorEl.createEl('option', { value: '' });
      option.setText('No models available');
      this.modelSelectorEl.disabled = true;
      return;
    }

    this.modelSelectorEl.disabled = false;

    for (const model of models) {
      const option = this.modelSelectorEl.createEl('option', { value: model.id });
      option.setText(model.name);
      if (model.id === currentModelId) {
        option.selected = true;
      }
    }
  }

  /**
   * Renders the sessions list
   */
  renderSessions(): void {
    if (!this.sessionsAreaEl || !this.dependencies) return;

    const sessionsListContainer = this.sessionsAreaEl.querySelector('.ai-chat-sessions-list');
    if (!sessionsListContainer) return;

    sessionsListContainer.empty();

    const sessions = this.dependencies.getAllSessions();
    const currentSessionId = this.dependencies.getCurrentSessionId();

    if (sessions.length === 0) {
      const emptyText = sessionsListContainer.createSpan({ cls: 'ai-chat-sessions-empty' });
      emptyText.setText('No chat history');
      return;
    }

    // Sort sessions by updatedAt descending (most recent first)
    const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

    for (const session of sortedSessions) {
      const isActive = session.id === currentSessionId;
      const sessionEl = sessionsListContainer.createDiv({ 
        cls: `ai-chat-session-item ${isActive ? 'ai-chat-session-item-active' : ''}` 
      });

      // Session info
      const sessionInfo = sessionEl.createDiv({ cls: 'ai-chat-session-info' });
      sessionInfo.addEventListener('click', () => this.handleSwitchSession(session.id));

      // Session title (date/time)
      const sessionTitle = sessionInfo.createDiv({ cls: 'ai-chat-session-title' });
      sessionTitle.setText(this.formatSessionDate(session.createdAt));

      // Session meta (message count)
      const sessionMeta = sessionInfo.createDiv({ cls: 'ai-chat-session-meta' });
      sessionMeta.setText(`${session.messageCount} messages`);

      // Delete button
      const deleteBtn = sessionEl.createEl('button', { cls: 'ai-chat-session-delete-btn' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.setAttribute('aria-label', 'Delete session');
      deleteBtn.setAttribute('title', 'Delete session');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleDeleteSession(session.id);
      });
    }
  }

  /**
   * Formats a session date for display
   */
  private formatSessionDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
           ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Renders context items as removable tags
   * Requirements: 5.5 - Display context items as removable tags
   */
  renderContextItems(): void {
    if (!this.contextAreaEl || !this.dependencies) return;

    const contextItemsContainer = this.contextAreaEl.querySelector('.ai-chat-context-items');
    if (!contextItemsContainer) return;

    contextItemsContainer.empty();

    const contextItems = this.dependencies.getContextItems();

    if (contextItems.length === 0) {
      const emptyText = contextItemsContainer.createSpan({ cls: 'ai-chat-context-empty' });
      emptyText.setText('No context added');
      return;
    }

    for (const item of contextItems) {
      // Add selection-specific class for quoted block styling
      const tagClasses = item.type === 'selection' 
        ? 'ai-chat-context-tag ai-chat-context-tag-selection'
        : 'ai-chat-context-tag';
      const tag = contextItemsContainer.createDiv({ cls: tagClasses });
      tag.setAttribute('data-type', item.type);
      
      // Icon based on type
      const iconEl = tag.createSpan({ cls: 'ai-chat-context-tag-icon' });
      const iconName = item.type === 'file' ? 'file-text' : 
                       item.type === 'folder' ? 'folder' : 'quote';
      setIcon(iconEl, iconName);

      // Display name
      const nameEl = tag.createSpan({ cls: 'ai-chat-context-tag-name' });
      nameEl.setText(item.displayName);
      nameEl.setAttribute('title', item.path || item.displayName);

      // Remove button
      const removeBtn = tag.createSpan({ cls: 'ai-chat-context-tag-remove' });
      setIcon(removeBtn, 'x');
      removeBtn.setAttribute('aria-label', `Remove ${item.displayName}`);
      removeBtn.addEventListener('click', () => this.handleRemoveContext(item.id));
    }
  }

  /**
   * Renders chat messages with timestamps
   * Requirements: 8.1 - Display messages in chronological order with timestamps
   */
  renderMessages(): void {
    if (!this.messagesContainerEl || !this.dependencies) return;

    this.messagesContainerEl.empty();

    const messages = this.dependencies.getMessages();

    if (messages.length === 0) {
      const emptyState = this.messagesContainerEl.createDiv({ cls: 'ai-chat-empty-state' });
      emptyState.setText('Start a conversation by typing a message below.');
      return;
    }

    for (const message of messages) {
      this.renderMessage(message);
    }

    // Scroll to bottom
    this.scrollToBottom();
  }

  /**
   * Renders a single message
   */
  private renderMessage(message: ChatMessage): void {
    if (!this.messagesContainerEl) return;

    const messageEl = this.messagesContainerEl.createDiv({
      cls: `ai-chat-message ai-chat-message-${message.role}`,
    });

    // Message header with role and timestamp
    const headerEl = messageEl.createDiv({ cls: 'ai-chat-message-header' });
    
    const roleEl = headerEl.createSpan({ cls: 'ai-chat-message-role' });
    roleEl.setText(message.role === 'user' ? 'You' : 'Assistant');

    const timestampEl = headerEl.createSpan({ cls: 'ai-chat-message-timestamp' });
    timestampEl.setText(this.formatTimestamp(message.timestamp));

    // Message content
    const contentEl = messageEl.createDiv({ cls: 'ai-chat-message-content' });
    contentEl.setText(message.content);
  }

  /**
   * Formats a timestamp for display
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Scrolls the messages container to the bottom
   */
  private scrollToBottom(): void {
    if (this.messagesContainerEl) {
      this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
    }
  }

  /**
   * Updates the loading state display
   */
  private updateLoadingState(): void {
    if (this.loadingIndicatorEl) {
      this.loadingIndicatorEl.style.display = this.isLoading ? 'flex' : 'none';
    }
    if (this.sendButtonEl) {
      this.sendButtonEl.disabled = this.isLoading;
    }
    if (this.inputTextareaEl) {
      this.inputTextareaEl.disabled = this.isLoading;
    }
  }

  /**
   * Updates the error display
   */
  private updateErrorDisplay(): void {
    if (!this.errorDisplayEl) return;

    if (this.errorMessage) {
      this.errorDisplayEl.style.display = 'block';
      this.errorDisplayEl.setText(this.errorMessage);
    } else {
      this.errorDisplayEl.style.display = 'none';
    }
  }

  /**
   * Sets the loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.updateLoadingState();
  }

  /**
   * Sets an error message to display
   */
  setError(message: string | null): void {
    this.errorMessage = message;
    this.updateErrorDisplay();
  }

  /**
   * Clears the error message
   */
  clearError(): void {
    this.setError(null);
  }

  /**
   * Handles model selection change
   * Requirements: 4.3 - WHEN the user selects a different model THEN the Plugin SHALL use the selected model for subsequent messages
   */
  private handleModelChange(): void {
    if (!this.modelSelectorEl || !this.dependencies) return;

    const selectedModelId = this.modelSelectorEl.value;
    if (selectedModelId) {
      this.dependencies.onModelChange(selectedModelId);
    }
  }

  /**
   * Handles creating a new session
   */
  private handleNewSession(): void {
    if (this.dependencies) {
      this.dependencies.onNewSession();
      this.refresh();
    }
  }

  /**
   * Handles switching to a different session
   */
  private handleSwitchSession(sessionId: string): void {
    if (this.dependencies) {
      this.dependencies.onSwitchSession(sessionId);
      this.refresh();
    }
  }

  /**
   * Handles deleting a session
   */
  private handleDeleteSession(sessionId: string): void {
    if (this.dependencies) {
      this.dependencies.onDeleteSession(sessionId);
      this.refresh();
    }
  }

  /**
   * Handles adding file context
   * Requirements: 5.3 - WHEN the user selects a file THEN the Plugin SHALL add the file content to the conversation context
   */
  private async handleAddFileContext(): Promise<void> {
    if (this.dependencies) {
      try {
        await this.dependencies.onAddFileContext();
        this.renderContextItems();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add file context';
        this.setError(errorMessage);
      }
    }
  }

  /**
   * Handles adding folder context
   * Requirements: 5.4 - WHEN the user selects a folder THEN the Plugin SHALL add all markdown files within that folder to the context
   */
  private async handleAddFolderContext(): Promise<void> {
    if (this.dependencies) {
      try {
        await this.dependencies.onAddFolderContext();
        this.renderContextItems();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add folder context';
        this.setError(errorMessage);
      }
    }
  }

  /**
   * Handles removing a context item
   * Requirements: 5.6 - WHEN the user removes a context item THEN the Plugin SHALL exclude that content from subsequent messages
   */
  private handleRemoveContext(contextId: string): void {
    if (this.dependencies) {
      this.dependencies.onRemoveContext(contextId);
      this.renderContextItems();
    }
  }

  /**
   * Handles sending a message
   * Requirements: 7.1 - WHEN the user types a message and presses send THEN the Plugin SHALL display the message in the chat history
   * Requirements: 7.2 - WHEN a message is sent THEN the Plugin SHALL make an API request to the selected AI provider
   * Requirements: 7.4 - WHEN the AI response is received THEN the Plugin SHALL display the response in the chat history
   * Requirements: 9.4 - WHEN the API supports streaming responses THEN the Plugin SHALL display tokens as they arrive
   */
  private async handleSendMessage(): Promise<void> {
    if (!this.inputTextareaEl || !this.dependencies) return;

    const content = this.inputTextareaEl.value.trim();
    if (!content) return;

    // Clear input
    this.inputTextareaEl.value = '';

    // Clear any previous error
    this.clearError();

    // Set loading state
    this.setLoading(true);

    try {
      // Check if streaming is enabled
      if (this.dependencies.isStreamingEnabled()) {
        // Create a placeholder for the streaming response
        this.createStreamingMessagePlaceholder();
        
        await this.dependencies.onSendMessageStream(content, (chunk: string) => {
          this.appendStreamingContent(chunk);
        });
        
        // Finalize the streaming message
        this.finalizeStreamingMessage();
      } else {
        await this.dependencies.onSendMessage(content);
      }
      
      this.renderMessages();
    } catch (error) {
      // Requirements: 7.5 - WHEN an API error occurs THEN the Plugin SHALL display an error message to the user
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      this.setError(errorMessage);
      // Remove streaming placeholder if it exists
      this.removeStreamingPlaceholder();
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Creates a placeholder element for streaming response
   */
  private createStreamingMessagePlaceholder(): void {
    if (!this.messagesContainerEl) return;

    this.streamingMessageEl = this.messagesContainerEl.createDiv({
      cls: 'ai-chat-message ai-chat-message-assistant ai-chat-message-streaming',
    });

    // Message header
    const headerEl = this.streamingMessageEl.createDiv({ cls: 'ai-chat-message-header' });
    
    const roleEl = headerEl.createSpan({ cls: 'ai-chat-message-role' });
    roleEl.setText('Assistant');

    const timestampEl = headerEl.createSpan({ cls: 'ai-chat-message-timestamp' });
    timestampEl.setText(this.formatTimestamp(Date.now()));

    // Message content (will be filled by streaming)
    this.streamingMessageEl.createDiv({ cls: 'ai-chat-message-content' });

    this.scrollToBottom();
  }

  /**
   * Appends content to the streaming message
   */
  private appendStreamingContent(chunk: string): void {
    if (!this.streamingMessageEl) return;

    const contentEl = this.streamingMessageEl.querySelector('.ai-chat-message-content');
    if (contentEl) {
      contentEl.textContent += chunk;
      this.scrollToBottom();
    }
  }

  /**
   * Finalizes the streaming message (removes streaming class)
   */
  private finalizeStreamingMessage(): void {
    if (this.streamingMessageEl) {
      this.streamingMessageEl.removeClass('ai-chat-message-streaming');
      this.streamingMessageEl = null;
    }
  }

  /**
   * Removes the streaming placeholder on error
   */
  private removeStreamingPlaceholder(): void {
    if (this.streamingMessageEl) {
      this.streamingMessageEl.remove();
      this.streamingMessageEl = null;
    }
  }

  /**
   * Handles keyboard events in the input textarea
   * Requirements: 7.6 - WHEN the user presses Enter THEN the Plugin SHALL send the message
   * Requirements: 7.7 - WHEN the user presses Shift+Enter THEN the Plugin SHALL insert a newline
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSendMessage();
    }
    // Shift+Enter allows default behavior (newline)
  }

  /**
   * Appends content to the last assistant message (for streaming)
   */
  appendToLastMessage(content: string): void {
    if (!this.messagesContainerEl) return;

    const lastMessage = this.messagesContainerEl.querySelector('.ai-chat-message-assistant:last-child .ai-chat-message-content');
    if (lastMessage) {
      lastMessage.textContent += content;
      this.scrollToBottom();
    }
  }

  /**
   * Gets the input textarea value
   */
  getInputValue(): string {
    return this.inputTextareaEl?.value || '';
  }

  /**
   * Sets the input textarea value
   */
  setInputValue(value: string): void {
    if (this.inputTextareaEl) {
      this.inputTextareaEl.value = value;
    }
  }

  /**
   * Focuses the input textarea
   */
  focusInput(): void {
    this.inputTextareaEl?.focus();
  }

  /**
   * Creates a new chat session
   * Requirements: 8.3 - WHEN the user starts a new chat session THEN the Plugin SHALL clear the current history and create a new session
   */
  newSession(): void {
    if (this.dependencies) {
      this.dependencies.onNewSession();
      this.refresh();
    }
  }

  /**
   * Adds a selection as context (called from commands)
   * Requirements: 6.3 - WHEN the AI Chat Sidebar opens with selected text THEN the Plugin SHALL add the selected text as a context item
   * Requirements: 6.5 - WHEN the user sends a message with selected text context THEN the Plugin SHALL include the text in the API request
   */
  addSelectionContext(content: string, sourcePath?: string): void {
    // This is handled by the plugin through the dependencies
    // The context manager will be called directly from the command
    this.renderContextItems();
  }
}
