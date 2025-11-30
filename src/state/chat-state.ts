/**
 * Chat State Manager for the AI Chat Sidebar plugin
 * Handles chat session management, message persistence, and state operations
 * 
 * Requirements: 1.4, 7.1, 7.4, 8.1, 8.3, 8.4, 8.5
 */

import type { ChatSession, ChatMessage, ContextItem, PluginSettings } from '../types';
import { MAX_SESSIONS } from '../constants';

/**
 * Generates a unique ID for sessions and messages
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * ChatStateManager class handles all chat state operations
 * Provides session management, message handling, and persistence
 */
export class ChatStateManager {
  private sessions: ChatSession[] = [];
  private currentSessionId: string | null = null;
  private saveCallback: ((sessions: ChatSession[], currentSessionId: string | null) => Promise<void>) | null = null;

  constructor(initialSessions?: ChatSession[], initialCurrentSessionId?: string | null) {
    this.sessions = initialSessions ? [...initialSessions] : [];
    this.currentSessionId = initialCurrentSessionId ?? null;
  }

  /**
   * Sets the callback function for persisting state
   */
  setSaveCallback(callback: (sessions: ChatSession[], currentSessionId: string | null) => Promise<void>): void {
    this.saveCallback = callback;
  }

  // ==================== Session Operations ====================

  /**
   * Creates a new chat session
   * Requirements: 8.3 - WHEN the user starts a new chat session THEN the Plugin SHALL clear the current history and create a new session
   */
  createSession(modelId: string): ChatSession {
    const session: ChatSession = {
      id: generateId(),
      messages: [],
      contextItems: [],
      currentModelId: modelId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.push(session);
    this.currentSessionId = session.id;

    // Prune old sessions if we exceed the maximum
    this.pruneSessions();

    return session;
  }

  /**
   * Gets the current active session
   * Requirements: 8.4 - WHEN the user closes and reopens the sidebar THEN the Plugin SHALL restore the most recent chat session
   */
  getCurrentSession(): ChatSession | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.find(s => s.id === this.currentSessionId) ?? null;
  }

  /**
   * Gets a session by ID
   */
  getSession(sessionId: string): ChatSession | null {
    return this.sessions.find(s => s.id === sessionId) ?? null;
  }

  /**
   * Gets all sessions
   */
  getAllSessions(): ChatSession[] {
    return [...this.sessions];
  }

  /**
   * Switches to a different session
   */
  switchSession(sessionId: string): boolean {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return false;
    }
    this.currentSessionId = sessionId;
    return true;
  }

  /**
   * Clears a session's message history
   */
  clearSession(sessionId: string): boolean {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return false;
    }
    session.messages = [];
    session.updatedAt = Date.now();
    return true;
  }

  /**
   * Deletes a session
   */
  deleteSession(sessionId: string): boolean {
    const index = this.sessions.findIndex(s => s.id === sessionId);
    if (index === -1) {
      return false;
    }

    this.sessions.splice(index, 1);

    // If we deleted the current session, switch to the most recent one
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions.length > 0 
        ? this.sessions[this.sessions.length - 1].id 
        : null;
    }

    return true;
  }

  /**
   * Prunes old sessions to keep only the most recent MAX_SESSIONS
   */
  private pruneSessions(): void {
    if (this.sessions.length > MAX_SESSIONS) {
      // Sort by updatedAt descending and keep only the most recent
      this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      this.sessions = this.sessions.slice(0, MAX_SESSIONS);

      // Ensure current session is still valid
      if (this.currentSessionId && !this.sessions.find(s => s.id === this.currentSessionId)) {
        this.currentSessionId = this.sessions.length > 0 ? this.sessions[0].id : null;
      }
    }
  }

  // ==================== Message Operations ====================

  /**
   * Adds a message to a session
   * Requirements: 7.1 - WHEN the user types a message and presses send THEN the Plugin SHALL display the message in the chat history
   * Requirements: 7.4 - WHEN the AI response is received THEN the Plugin SHALL display the response in the chat history
   * Requirements: 8.1 - WHEN messages are exchanged THEN the Plugin SHALL display them in chronological order with timestamps
   */
  addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage | null {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return null;
    }

    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };

    session.messages.push(newMessage);
    session.updatedAt = Date.now();

    return newMessage;
  }

  /**
   * Gets messages for a session in chronological order
   * Requirements: 8.1 - WHEN messages are exchanged THEN the Plugin SHALL display them in chronological order with timestamps
   */
  getMessages(sessionId: string): ChatMessage[] {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return [];
    }
    // Return messages sorted by timestamp (chronological order)
    return [...session.messages].sort((a, b) => a.timestamp - b.timestamp);
  }

  // ==================== Context Operations ====================

  /**
   * Adds a context item to a session
   */
  addContextItem(sessionId: string, contextItem: ContextItem): boolean {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return false;
    }
    session.contextItems.push(contextItem);
    session.updatedAt = Date.now();
    return true;
  }

  /**
   * Removes a context item from a session
   */
  removeContextItem(sessionId: string, contextItemId: string): boolean {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return false;
    }
    const index = session.contextItems.findIndex(c => c.id === contextItemId);
    if (index === -1) {
      return false;
    }
    session.contextItems.splice(index, 1);
    session.updatedAt = Date.now();
    return true;
  }

  /**
   * Gets context items for a session
   */
  getContextItems(sessionId: string): ContextItem[] {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return [];
    }
    return [...session.contextItems];
  }

  // ==================== Model Operations ====================

  /**
   * Updates the current model for a session
   */
  setSessionModel(sessionId: string, modelId: string): boolean {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return false;
    }
    session.currentModelId = modelId;
    session.updatedAt = Date.now();
    return true;
  }

  // ==================== Persistence Operations ====================

  /**
   * Saves the current state using the registered callback
   * Requirements: 8.5 - WHERE chat history exists THEN the Plugin SHALL persist it to disk for retrieval across Obsidian restarts
   */
  async saveState(): Promise<void> {
    if (this.saveCallback) {
      await this.saveCallback(this.sessions, this.currentSessionId);
    }
  }

  /**
   * Loads state from provided data
   * Requirements: 1.4 - WHEN the user closes the AI Chat Sidebar THEN the Plugin SHALL preserve the current chat session for later retrieval
   * Requirements: 8.4 - WHEN the user closes and reopens the sidebar THEN the Plugin SHALL restore the most recent chat session
   */
  loadState(sessions: ChatSession[], currentSessionId: string | null): void {
    this.sessions = sessions ? [...sessions] : [];
    this.currentSessionId = currentSessionId;

    // Validate current session ID exists
    if (this.currentSessionId && !this.sessions.find(s => s.id === this.currentSessionId)) {
      this.currentSessionId = this.sessions.length > 0 ? this.sessions[0].id : null;
    }
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Exports state for persistence
   */
  exportState(): { sessions: ChatSession[]; currentSessionId: string | null } {
    return {
      sessions: [...this.sessions],
      currentSessionId: this.currentSessionId,
    };
  }
}
