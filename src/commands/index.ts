/**
 * Commands module for the AI Chat Sidebar plugin
 * Contains plugin command implementations and registration functions
 * 
 * Requirements: 1.1, 6.1, 6.2, 6.3, 8.3
 */

import type { Plugin, Editor, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_CHAT } from '../constants';
import type { ChatView } from '../ui/chat-view';
import type { ChatStateManager } from '../state/chat-state';
import type { ContextManager } from '../context/context-manager';

/**
 * Command IDs for the plugin
 */
export const COMMAND_IDS = {
  OPEN_CHAT: 'open-ai-chat',
  CHAT_WITH_SELECTION: 'chat-with-selection',
  NEW_SESSION: 'new-chat-session',
  TOGGLE_SIDEBAR: 'toggle-ai-chat-sidebar',
} as const;

/**
 * Dependencies required for command operations
 */
export interface CommandDependencies {
  plugin: Plugin;
  getChatView: () => ChatView | null;
  getChatStateManager: () => ChatStateManager;
  getContextManager: () => ContextManager;
  getDefaultModelId: () => string | null;
  activateView: () => Promise<void>;
}

/**
 * Activates the chat view in the sidebar
 * Requirements: 1.1 - WHEN the user activates the AI chat command THEN the Plugin SHALL display the AI Chat Sidebar
 */
export async function activateChatView(deps: CommandDependencies): Promise<WorkspaceLeaf | null> {
  const { plugin } = deps;
  const workspace = plugin.app.workspace;
  
  // Check if view is already open
  const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
  
  if (existingLeaves.length > 0) {
    // View exists, reveal it
    workspace.revealLeaf(existingLeaves[0]);
    return existingLeaves[0];
  }
  
  // Create new view in right sidebar
  const leaf = workspace.getRightLeaf(false);
  if (leaf) {
    await leaf.setViewState({
      type: VIEW_TYPE_CHAT,
      active: true,
    });
    workspace.revealLeaf(leaf);
    return leaf;
  }
  
  return null;
}

/**
 * Toggles the chat sidebar visibility
 * Requirements: 1.1 - WHEN the user activates the AI chat command THEN the Plugin SHALL display the AI Chat Sidebar
 */
export async function toggleChatSidebar(deps: CommandDependencies): Promise<void> {
  const { plugin } = deps;
  const workspace = plugin.app.workspace;
  
  const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
  
  if (existingLeaves.length > 0) {
    // View exists, close it
    existingLeaves[0].detach();
  } else {
    // View doesn't exist, open it
    await activateChatView(deps);
  }
}

/**
 * Opens chat with selected text as context
 * Requirements: 6.1 - WHEN the user selects text in the editor THEN the Plugin SHALL detect the text selection
 * Requirements: 6.2 - WHEN text is selected and the user triggers the "chat with selection" command THEN the Plugin SHALL open the AI Chat Sidebar
 * Requirements: 6.3 - WHEN the AI Chat Sidebar opens with selected text THEN the Plugin SHALL add the selected text as a context item
 */
export async function chatWithSelection(
  deps: CommandDependencies,
  editor: Editor,
  view: MarkdownView
): Promise<void> {
  const selection = editor.getSelection();
  
  if (!selection || selection.trim().length === 0) {
    // No selection, just open the chat
    await activateChatView(deps);
    return;
  }
  
  // Get the source file path
  const sourcePath = view.file?.path;
  
  // Add selection as context
  const contextManager = deps.getContextManager();
  contextManager.addSelection(selection, sourcePath);
  
  // Open the chat view
  await activateChatView(deps);
  
  // Refresh the chat view to show the new context
  const chatView = deps.getChatView();
  if (chatView) {
    chatView.refresh();
    chatView.focusInput();
  }
}

/**
 * Creates a new chat session
 * Requirements: 8.3 - WHEN the user starts a new chat session THEN the Plugin SHALL clear the current history and create a new session
 */
export function createNewSession(deps: CommandDependencies): void {
  const chatStateManager = deps.getChatStateManager();
  const contextManager = deps.getContextManager();
  const defaultModelId = deps.getDefaultModelId();
  
  // Clear current context
  contextManager.clearContext();
  
  // Create new session with default model
  const modelId = defaultModelId || '';
  chatStateManager.createSession(modelId);
  
  // Save state
  chatStateManager.saveState();
  
  // Refresh the chat view
  const chatView = deps.getChatView();
  if (chatView) {
    chatView.refresh();
    chatView.focusInput();
  }
}

/**
 * Registers all plugin commands
 * Requirements: 1.1, 6.1, 6.2, 6.3, 8.3
 */
export function registerCommands(deps: CommandDependencies): void {
  const { plugin } = deps;
  
  // Open AI Chat command
  // Requirements: 1.1 - WHEN the user activates the AI chat command THEN the Plugin SHALL display the AI Chat Sidebar
  plugin.addCommand({
    id: COMMAND_IDS.OPEN_CHAT,
    name: 'Open AI Chat',
    callback: async () => {
      await activateChatView(deps);
    },
  });
  
  // Chat with selection command (editor command)
  // Requirements: 6.1, 6.2, 6.3 - Handle text selection and open chat with context
  plugin.addCommand({
    id: COMMAND_IDS.CHAT_WITH_SELECTION,
    name: 'Chat with selection',
    editorCallback: async (editor: Editor, view: MarkdownView) => {
      await chatWithSelection(deps, editor, view);
    },
  });
  
  // New chat session command
  // Requirements: 8.3 - WHEN the user starts a new chat session THEN the Plugin SHALL clear the current history and create a new session
  plugin.addCommand({
    id: COMMAND_IDS.NEW_SESSION,
    name: 'New chat session',
    callback: async () => {
      // Ensure chat view is open first
      await activateChatView(deps);
      createNewSession(deps);
    },
  });
  
  // Toggle sidebar visibility command
  plugin.addCommand({
    id: COMMAND_IDS.TOGGLE_SIDEBAR,
    name: 'Toggle AI Chat sidebar',
    callback: async () => {
      await toggleChatSidebar(deps);
    },
  });
}
