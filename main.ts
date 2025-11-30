/**
 * AI Chat Sidebar Plugin for Obsidian
 * Main plugin entry point - handles lifecycle management and module initialization
 * 
 * Requirements: 1.1, 1.3, 10.6
 */

import { Plugin, WorkspaceLeaf, TFile, TFolder, Notice, MarkdownView, Editor } from 'obsidian';
import { VIEW_TYPE_CHAT, DEFAULT_SETTINGS } from './src/constants';
import type { PluginSettings, ChatMessage, ContextItem } from './src/types';

// Import modules
import { SettingsManager, AISettingsTab } from './src/settings';
import { ChatStateManager } from './src/state';
import { ContextManager, createObsidianAdapter, LiveSelectionManager } from './src/context';
import { AIServiceClient, APIError } from './src/services';
import { ChatView, type ChatViewDependencies, type LiveSelectionInfo } from './src/ui';
import { registerCommands, type CommandDependencies } from './src/commands';

/**
 * Main plugin class for AI Chat Sidebar
 * Requirements: 10.6 - WHEN the plugin loads THEN the Plugin SHALL register all commands and views in the main plugin class
 */
export default class AIChatSidebarPlugin extends Plugin {
  // Core managers
  private settingsManager!: SettingsManager;
  private chatStateManager!: ChatStateManager;
  private contextManager!: ContextManager;
  private aiServiceClient!: AIServiceClient;
  private liveSelectionManager!: LiveSelectionManager;

  // Track sidebar state for persistence
  private sidebarWasOpen = false;

  // Debounce timer for selection updates
  private selectionDebounceTimer: number | null = null;
  private readonly SELECTION_DEBOUNCE_MS = 150;

  // Track the last known selection to preserve it when focus is lost
  private lastKnownSelection: { content: string; sourcePath?: string } | null = null;

  /**
   * Plugin initialization
   * Requirements: 1.1 - WHEN the user activates the AI chat command THEN the Plugin SHALL display the AI Chat Sidebar
   * Requirements: 1.3 - WHEN the AI Chat Sidebar is visible THEN the Plugin SHALL persist the sidebar state across Obsidian sessions
   * Requirements: 10.6 - Register all commands and views
   */
  async onload(): Promise<void> {
    // Load saved data
    const savedData = await this.loadData();
    
    // Initialize settings manager
    this.settingsManager = new SettingsManager(savedData);
    this.settingsManager.setSaveCallback(async (settings) => {
      await this.saveData(settings);
    });

    // Initialize chat state manager
    const settings = this.settingsManager.getSettings();
    this.chatStateManager = new ChatStateManager(
      settings.sessions,
      settings.currentSessionId
    );
    this.chatStateManager.setSaveCallback(async (sessions, currentSessionId) => {
      const currentSettings = this.settingsManager.getSettings();
      await this.saveData({
        ...currentSettings,
        sessions,
        currentSessionId,
      });
    });

    // Initialize context manager with Obsidian file system adapter
    this.contextManager = new ContextManager();
    this.contextManager.setFileSystem(createObsidianAdapter(this.app));

    // Initialize AI service client
    this.aiServiceClient = new AIServiceClient();

    // Initialize live selection manager
    // Requirements: 11.1 - Automatically detect and track text selection
    this.liveSelectionManager = new LiveSelectionManager();
    this.liveSelectionManager.setOnChangeCallback(() => {
      this.refreshChatView();
    });

    // Register the chat view
    this.registerView(
      VIEW_TYPE_CHAT,
      (leaf) => this.createChatView(leaf)
    );

    // Register commands
    this.registerPluginCommands();

    // Add settings tab
    this.addSettingTab(new AISettingsTab(
      this.app,
      this,
      this.settingsManager,
      async () => {
        await this.settingsManager.saveSettings();
        // Refresh chat view if open
        this.refreshChatView();
      }
    ));

    // Add ribbon icon (功能区图标)
    this.addRibbonIcon('message-square', 'Open AI Chat', () => {
      this.activateView();
    });

    // Restore sidebar state if it was open
    // Requirements: 1.3 - Persist sidebar state across sessions
    if (savedData?.sidebarWasOpen) {
      // Use a small delay to ensure workspace is ready
      this.app.workspace.onLayoutReady(() => {
        this.activateView();
      });
    }

    // Track sidebar state changes
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.trackSidebarState();
      })
    );

    // Register editor selection change event listener
    // Requirements: 11.1 - WHEN the user selects text in the editor THEN the Plugin SHALL automatically detect and track the selection
    // Requirements: 11.4 - WHEN the user changes the text selection THEN the Plugin SHALL update the live selection context
    // Requirements: 11.5 - WHEN the user clears the text selection THEN the Plugin SHALL remove the live selection indicator
    
    // Listen for selection changes in the document
    // This fires whenever the user selects or deselects text anywhere
    // IMPORTANT: We capture the selection immediately when it changes, before focus is lost
    this.registerDomEvent(document, 'selectionchange', () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        this.handleEditorSelectionChange(activeView.editor);
      }
    });

    // Listen for mouseup to capture selection immediately after user finishes selecting
    // This ensures we capture the selection BEFORE the user clicks elsewhere
    this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        // Use a small delay to ensure selection is finalized
        setTimeout(() => {
          this.handleEditorSelectionChange(activeView.editor);
        }, 10);
      } else {
        // If clicking outside the editor (e.g., in chat sidebar), preserve the selection
        // Don't clear it
      }
    });

    // Listen for keyboard selection (Shift+Arrow keys, Ctrl+A, etc.)
    this.registerDomEvent(document, 'keyup', (evt: KeyboardEvent) => {
      // Only process if it's a selection-related key
      if (evt.shiftKey || evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' || 
          evt.key === 'ArrowUp' || evt.key === 'ArrowDown' || 
          (evt.ctrlKey && evt.key === 'a')) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          this.handleEditorSelectionChange(activeView.editor);
        }
      }
    });

    // Also listen for active leaf changes to track selection in newly focused editors
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          this.handleEditorSelectionChange(activeView.editor);
        } else {
          // Don't clear selection when leaving editor - keep it for the chat
          // Only clear if there was no selection to begin with
          // This allows the selection to persist when clicking the chat sidebar
        }
      })
    );
  }

  /**
   * Plugin cleanup
   */
  onunload(): void {
    // Save final state before unloading
    this.trackSidebarState();
    
    // Detach all chat views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  /**
   * Creates a ChatView instance with all dependencies wired up
   */
  private createChatView(leaf: WorkspaceLeaf): ChatView {
    const chatView = new ChatView(leaf);
    
    // Set up dependencies for the chat view
    const dependencies: ChatViewDependencies = {
      getAvailableModels: () => this.settingsManager.getAvailableModels(),
      getCurrentModelId: () => this.getCurrentModelId(),
      getMessages: () => this.getSessionMessages(),
      getContextItems: () => this.contextManager.getActiveContext(),
      getLiveSelection: () => this.getLiveSelectionInfo(),
      getAllSessions: () => this.getAllSessionsInfo(),
      getCurrentSessionId: () => this.chatStateManager.getCurrentSessionId(),
      onSendMessage: async (content) => this.handleSendMessage(content),
      onSendMessageStream: async (content, onChunk) => this.handleSendMessageStream(content, onChunk),
      onModelChange: (modelId) => this.handleModelChange(modelId),
      onRemoveContext: (contextId) => this.handleRemoveContext(contextId),
      onClearLiveSelection: () => this.handleClearLiveSelection(),
      onAddFileContext: async () => this.handleAddFileContext(),
      onAddFolderContext: async () => this.handleAddFolderContext(),
      onNewSession: () => this.handleNewSession(),
      onSwitchSession: (sessionId) => this.handleSwitchSession(sessionId),
      onDeleteSession: (sessionId) => this.handleDeleteSession(sessionId),
      isStreamingEnabled: () => this.settingsManager.isStreamingEnabled(),
    };
    
    chatView.setDependencies(dependencies);
    return chatView;
  }

  /**
   * Registers all plugin commands
   * Requirements: 10.6 - Register all commands in the main plugin class
   */
  private registerPluginCommands(): void {
    const commandDeps: CommandDependencies = {
      plugin: this,
      getChatView: () => this.getChatView(),
      getChatStateManager: () => this.chatStateManager,
      getContextManager: () => this.contextManager,
      getDefaultModelId: () => this.settingsManager.getDefaultModel()?.id ?? null,
      activateView: () => this.activateView(),
    };
    
    registerCommands(commandDeps);
  }

  /**
   * Activates the chat view in the sidebar
   * Requirements: 1.1 - Display the AI Chat Sidebar when activated
   */
  async activateView(): Promise<void> {
    const workspace = this.app.workspace;
    
    // Check if view is already open
    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    
    if (existingLeaves.length > 0) {
      // View exists, reveal it
      workspace.revealLeaf(existingLeaves[0]);
      return;
    }
    
    // Create new view in right sidebar
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_CHAT,
        active: true,
      });
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * Gets the current chat view instance if open
   */
  private getChatView(): ChatView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (leaves.length > 0) {
      return leaves[0].view as ChatView;
    }
    return null;
  }

  /**
   * Refreshes the chat view if it's open
   */
  private refreshChatView(): void {
    const chatView = this.getChatView();
    if (chatView) {
      chatView.refresh();
    }
  }

  /**
   * Tracks whether the sidebar is open for state persistence
   * Requirements: 1.3 - Persist sidebar state across sessions
   */
  private async trackSidebarState(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    const isOpen = leaves.length > 0;
    
    if (this.sidebarWasOpen !== isOpen) {
      this.sidebarWasOpen = isOpen;
      const settings = this.settingsManager.getSettings();
      await this.saveData({
        ...settings,
        sidebarWasOpen: isOpen,
      });
    }
  }

  /**
   * Handles editor selection changes with debouncing
   * Requirements: 11.1 - Automatically detect and track text selection
   * Requirements: 11.4 - Update live selection when selection changes
   * Requirements: 11.5 - Remove live selection indicator when selection is cleared
   */
  private handleEditorSelectionChange(editor: Editor): void {
    // Clear any existing debounce timer
    if (this.selectionDebounceTimer !== null) {
      window.clearTimeout(this.selectionDebounceTimer);
    }

    // Debounce selection updates to avoid excessive updates
    this.selectionDebounceTimer = window.setTimeout(() => {
      this.selectionDebounceTimer = null;
      this.updateLiveSelection(editor);
    }, this.SELECTION_DEBOUNCE_MS);
  }

  /**
   * Updates the live selection based on current editor state
   * IMPORTANT: This method preserves selection even when focus is lost
   */
  private updateLiveSelection(editor: Editor): void {
    const selection = editor.getSelection();
    
    if (selection && selection.trim().length > 0) {
      // Get the source file path if available
      const activeFile = this.app.workspace.getActiveFile();
      const sourcePath = activeFile?.path;
      
      // Save this as the last known selection
      this.lastKnownSelection = { content: selection, sourcePath };
      
      // Set the selection - this will be preserved even when focus is lost
      this.liveSelectionManager.setSelection(selection, sourcePath);
    } else if (this.lastKnownSelection) {
      // If editor.getSelection() returns empty but we have a last known selection,
      // it might be because focus was lost. Keep the last known selection.
      // Only clear if the user explicitly deselected in the editor.
      
      // Check if we're still in an editor with focus
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editorHasFocus = activeView && document.activeElement?.closest('.cm-editor');
      
      if (editorHasFocus) {
        // User is in the editor and deselected - clear it
        this.lastKnownSelection = null;
        this.liveSelectionManager.clearSelection();
      }
      // Otherwise, keep the last known selection (focus was lost to chat sidebar)
    } else {
      // No selection and no last known selection - clear it
      this.liveSelectionManager.clearSelection();
    }
  }

  /**
   * Gets the current model ID from the active session
   */
  private getCurrentModelId(): string | null {
    const session = this.chatStateManager.getCurrentSession();
    return session?.currentModelId ?? this.settingsManager.getDefaultModel()?.id ?? null;
  }

  /**
   * Gets messages from the current session
   */
  private getSessionMessages(): ChatMessage[] {
    const session = this.chatStateManager.getCurrentSession();
    if (!session) {
      return [];
    }
    return this.chatStateManager.getMessages(session.id);
  }

  /**
   * Gets live selection info for the chat view
   * Requirements: 11.2, 11.3 - Display live selection indicator with preview
   */
  private getLiveSelectionInfo(): LiveSelectionInfo {
    return {
      hasSelection: this.liveSelectionManager.hasSelection(),
      preview: this.liveSelectionManager.getPreview(100),
      sourcePath: this.liveSelectionManager.getSourcePath(),
    };
  }

  /**
   * Gets context items including live selection for API requests
   * Requirements: 11.6 - Include live selection in API request
   * Requirements: 11.7 - Live selection is NOT persisted as permanent context item
   */
  private getContextItemsWithLiveSelection(): ContextItem[] {
    // Get permanent context items
    const contextItems = [...this.contextManager.getActiveContext()];

    // Add live selection as a temporary context item (not persisted)
    if (this.liveSelectionManager.hasSelection()) {
      const selection = this.liveSelectionManager.getSelection();
      if (selection) {
        const liveSelectionItem: ContextItem = {
          id: `live-selection-${selection.timestamp}`,
          type: 'selection',
          path: selection.sourcePath,
          content: selection.content,
          displayName: selection.sourcePath 
            ? `Live Selection from ${selection.sourcePath.split('/').pop()}`
            : 'Live Selection',
        };
        // Prepend live selection so it appears first in context
        contextItems.unshift(liveSelectionItem);
      }
    }

    return contextItems;
  }

  /**
   * Handles sending a non-streaming message
   * Requirements: 11.6 - Include live selection in API request
   * Requirements: 11.7 - Live selection is NOT persisted as permanent context item
   */
  private async handleSendMessage(content: string): Promise<void> {
    // Ensure we have a session
    let session = this.chatStateManager.getCurrentSession();
    if (!session) {
      const defaultModelId = this.settingsManager.getDefaultModel()?.id ?? '';
      session = this.chatStateManager.createSession(defaultModelId);
    }

    // Get the current model and provider
    const modelId = session.currentModelId;
    const model = this.settingsManager.getModel(modelId);
    if (!model) {
      throw new Error('No model selected. Please select a model in the settings.');
    }

    const provider = this.settingsManager.getProvider(model.providerId);
    if (!provider) {
      throw new Error('Provider not found for the selected model.');
    }

    if (!provider.enabled) {
      throw new Error('The provider for this model is disabled.');
    }

    // Add user message to session
    this.chatStateManager.addMessage(session.id, {
      role: 'user',
      content,
      modelId,
    });

    // Get all messages for context
    const messages = this.chatStateManager.getMessages(session.id);
    
    // Get permanent context items and include live selection (if any)
    // Requirements: 11.6 - Include live selection in API request
    // Requirements: 11.7 - Live selection is NOT saved to session context items
    const contextItems = this.getContextItemsWithLiveSelection();

    try {
      // Send message to AI
      const response = await this.aiServiceClient.sendMessage(
        provider,
        model,
        messages,
        contextItems
      );

      // Add assistant response to session
      this.chatStateManager.addMessage(session.id, {
        role: 'assistant',
        content: response,
        modelId,
      });

      // Save state
      await this.chatStateManager.saveState();
    } catch (error) {
      // Re-throw with user-friendly message
      if (error instanceof APIError) {
        throw error;
      }
      throw new Error('Failed to get response from AI. Please try again.');
    }
  }

  /**
   * Handles sending a streaming message
   * Requirements: 11.6 - Include live selection in API request
   * Requirements: 11.7 - Live selection is NOT persisted as permanent context item
   */
  private async handleSendMessageStream(
    content: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    // Ensure we have a session
    let session = this.chatStateManager.getCurrentSession();
    if (!session) {
      const defaultModelId = this.settingsManager.getDefaultModel()?.id ?? '';
      session = this.chatStateManager.createSession(defaultModelId);
    }

    // Get the current model and provider
    const modelId = session.currentModelId;
    const model = this.settingsManager.getModel(modelId);
    if (!model) {
      throw new Error('No model selected. Please select a model in the settings.');
    }

    const provider = this.settingsManager.getProvider(model.providerId);
    if (!provider) {
      throw new Error('Provider not found for the selected model.');
    }

    if (!provider.enabled) {
      throw new Error('The provider for this model is disabled.');
    }

    // Add user message to session
    this.chatStateManager.addMessage(session.id, {
      role: 'user',
      content,
      modelId,
    });

    // Get all messages for context
    const messages = this.chatStateManager.getMessages(session.id);
    
    // Get permanent context items and include live selection (if any)
    // Requirements: 11.6 - Include live selection in API request
    // Requirements: 11.7 - Live selection is NOT saved to session context items
    const contextItems = this.getContextItemsWithLiveSelection();

    // Collect the full response
    let fullResponse = '';

    try {
      // Send streaming message to AI
      await this.aiServiceClient.sendMessageStream(
        provider,
        model,
        messages,
        contextItems,
        (chunk) => {
          fullResponse += chunk;
          onChunk(chunk);
        }
      );

      // Add assistant response to session
      this.chatStateManager.addMessage(session.id, {
        role: 'assistant',
        content: fullResponse,
        modelId,
      });

      // Save state
      await this.chatStateManager.saveState();
    } catch (error) {
      // Re-throw with user-friendly message
      if (error instanceof APIError) {
        throw error;
      }
      throw new Error('Failed to get response from AI. Please try again.');
    }
  }

  /**
   * Handles model selection change
   */
  private handleModelChange(modelId: string): void {
    const session = this.chatStateManager.getCurrentSession();
    if (session) {
      this.chatStateManager.setSessionModel(session.id, modelId);
      this.chatStateManager.saveState();
    }
  }

  /**
   * Handles removing a context item
   */
  private handleRemoveContext(contextId: string): void {
    this.contextManager.removeContext(contextId);
  }

  /**
   * Handles clearing the live selection
   * This allows users to manually clear the selection by clicking the X button
   */
  private handleClearLiveSelection(): void {
    this.lastKnownSelection = null;
    this.liveSelectionManager.clearSelection();
  }

  /**
   * Handles adding file context via file picker
   */
  private async handleAddFileContext(): Promise<void> {
    // Use Obsidian's file suggester
    const file = await this.promptForFile();
    if (file) {
      await this.contextManager.addFile(file.path);
      this.refreshChatView();
    }
  }

  /**
   * Handles adding folder context via folder picker
   */
  private async handleAddFolderContext(): Promise<void> {
    // Use Obsidian's folder suggester
    const folder = await this.promptForFolder();
    if (folder) {
      await this.contextManager.addFolder(folder.path);
      this.refreshChatView();
    }
  }

  /**
   * Prompts user to select a file
   */
  private async promptForFile(): Promise<TFile | null> {
    return new Promise((resolve) => {
      const modal = new FilePickerModal(this.app, (file) => {
        resolve(file);
      });
      modal.open();
    });
  }

  /**
   * Prompts user to select a folder
   */
  private async promptForFolder(): Promise<TFolder | null> {
    return new Promise((resolve) => {
      const modal = new FolderPickerModal(this.app, (folder) => {
        resolve(folder);
      });
      modal.open();
    });
  }

  /**
   * Handles creating a new chat session
   */
  private handleNewSession(): void {
    const defaultModelId = this.settingsManager.getDefaultModel()?.id ?? '';
    this.chatStateManager.createSession(defaultModelId);
    this.contextManager.clearContext();
    this.chatStateManager.saveState();
    this.refreshChatView();
  }

  /**
   * Gets all sessions info for display
   */
  private getAllSessionsInfo(): Array<{ id: string; createdAt: number; updatedAt: number; messageCount: number }> {
    const sessions = this.chatStateManager.getAllSessions();
    return sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    }));
  }

  /**
   * Handles switching to a different session
   */
  private handleSwitchSession(sessionId: string): void {
    this.chatStateManager.switchSession(sessionId);
    this.contextManager.clearContext();
    
    // Load context items from the session
    const session = this.chatStateManager.getSession(sessionId);
    if (session) {
      for (const item of session.contextItems) {
        this.contextManager.addContextItem(item);
      }
    }
    
    this.chatStateManager.saveState();
    this.refreshChatView();
  }

  /**
   * Handles deleting a session
   */
  private handleDeleteSession(sessionId: string): void {
    this.chatStateManager.deleteSession(sessionId);
    this.chatStateManager.saveState();
    this.refreshChatView();
  }
}


// ==================== Modal Classes ====================

import { Modal, FuzzySuggestModal, TAbstractFile } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';

/**
 * File picker modal using fuzzy search
 */
class FilePickerModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile | null) => void;

  constructor(app: App, onSelect: (file: TFile | null) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Select a file to add as context...');
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item);
  }

  onClose(): void {
    // If modal is closed without selection, resolve with null
    // Note: onChooseItem is called before onClose when an item is selected
  }
}

/**
 * Folder picker modal using fuzzy search
 */
class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private onSelect: (folder: TFolder | null) => void;

  constructor(app: App, onSelect: (folder: TFolder | null) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Select a folder to add as context...');
  }

  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    
    // Get all folders from the vault
    const collectFolders = (folder: TFolder) => {
      folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          collectFolders(child);
        }
      }
    };
    
    // Start from root
    const root = this.app.vault.getRoot();
    collectFolders(root);
    
    return folders;
  }

  getItemText(item: TFolder): string {
    return item.path || '/';
  }

  onChooseItem(item: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item);
  }

  onClose(): void {
    // If modal is closed without selection, resolve with null
  }
}
