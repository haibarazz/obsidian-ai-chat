/**
 * Property-based tests and unit tests for ChatStateManager
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ChatStateManager } from './chat-state';
import type { ChatMessage, ChatSession, ContextItem } from '../types';

/**
 * Custom arbitrary for generating valid ChatMessage objects (without id and timestamp)
 */
const arbitraryMessageInput = (): fc.Arbitrary<Omit<ChatMessage, 'id' | 'timestamp'>> =>
  fc.record({
    role: fc.constantFrom('user', 'assistant', 'system') as fc.Arbitrary<'user' | 'assistant' | 'system'>,
    content: fc.string({ minLength: 1 }),
    modelId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  });

/**
 * Custom arbitrary for generating valid ContextItem objects
 */
const arbitraryContextItem = (): fc.Arbitrary<ContextItem> =>
  fc.record({
    id: fc.string({ minLength: 1 }),
    type: fc.constantFrom('file', 'folder', 'selection') as fc.Arbitrary<'file' | 'folder' | 'selection'>,
    path: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    content: fc.string(),
    displayName: fc.string({ minLength: 1 }),
  });

/**
 * Custom arbitrary for generating a model ID
 */
const arbitraryModelId = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

describe('ChatStateManager - Session Preservation', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 2: Session preservation on close**
   * 
   * *For any* chat session with messages, when the sidebar is closed and reopened, 
   * the session should contain the same messages.
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 2: Session preservation on close', () => {
    fc.assert(
      fc.property(
        arbitraryModelId(),
        fc.array(arbitraryMessageInput(), { minLength: 1, maxLength: 10 }),
        (modelId, messageInputs) => {
          // Create manager and session
          const manager = new ChatStateManager();
          const session = manager.createSession(modelId);

          // Add messages to the session
          const addedMessages: ChatMessage[] = [];
          for (const input of messageInputs) {
            const msg = manager.addMessage(session.id, input);
            if (msg) {
              addedMessages.push(msg);
            }
          }

          // Export state (simulating close)
          const exportedState = manager.exportState();

          // Create new manager and load state (simulating reopen)
          const newManager = new ChatStateManager();
          newManager.loadState(exportedState.sessions, exportedState.currentSessionId);

          // Verify session is restored
          const restoredSession = newManager.getCurrentSession();
          expect(restoredSession).not.toBeNull();
          expect(restoredSession!.id).toBe(session.id);

          // Verify messages are preserved
          const restoredMessages = newManager.getMessages(session.id);
          expect(restoredMessages.length).toBe(addedMessages.length);

          // Verify each message content is preserved
          for (let i = 0; i < addedMessages.length; i++) {
            expect(restoredMessages[i].id).toBe(addedMessages[i].id);
            expect(restoredMessages[i].role).toBe(addedMessages[i].role);
            expect(restoredMessages[i].content).toBe(addedMessages[i].content);
            expect(restoredMessages[i].timestamp).toBe(addedMessages[i].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('ChatStateManager - Message Chronological Ordering', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 27: Message chronological ordering**
   * 
   * *For any* set of messages in a session, they should be displayed in 
   * chronological order by timestamp.
   * 
   * **Validates: Requirements 8.1**
   */
  it('Property 27: Message chronological ordering', () => {
    fc.assert(
      fc.property(
        arbitraryModelId(),
        fc.array(arbitraryMessageInput(), { minLength: 2, maxLength: 20 }),
        (modelId, messageInputs) => {
          // Create manager and session
          const manager = new ChatStateManager();
          const session = manager.createSession(modelId);

          // Add messages to the session
          for (const input of messageInputs) {
            manager.addMessage(session.id, input);
          }

          // Get messages (should be in chronological order)
          const messages = manager.getMessages(session.id);

          // Verify messages are in chronological order by timestamp
          for (let i = 1; i < messages.length; i++) {
            expect(messages[i].timestamp).toBeGreaterThanOrEqual(messages[i - 1].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('ChatStateManager - New Session Clears History', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 28: New session clears history**
   * 
   * *For any* new session creation, the session should start with an empty 
   * message history.
   * 
   * **Validates: Requirements 8.3**
   */
  it('Property 28: New session clears history', () => {
    fc.assert(
      fc.property(
        arbitraryModelId(),
        fc.array(arbitraryMessageInput(), { minLength: 1, maxLength: 10 }),
        arbitraryModelId(),
        (modelId1, messageInputs, modelId2) => {
          // Create manager and first session
          const manager = new ChatStateManager();
          const session1 = manager.createSession(modelId1);

          // Add messages to the first session
          for (const input of messageInputs) {
            manager.addMessage(session1.id, input);
          }

          // Verify first session has messages
          const session1Messages = manager.getMessages(session1.id);
          expect(session1Messages.length).toBe(messageInputs.length);

          // Create a new session
          const session2 = manager.createSession(modelId2);

          // Verify new session has empty message history
          expect(session2.messages).toHaveLength(0);
          const session2Messages = manager.getMessages(session2.id);
          expect(session2Messages).toHaveLength(0);

          // Verify new session is now the current session
          expect(manager.getCurrentSessionId()).toBe(session2.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('ChatStateManager - Session Restoration', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 29: Session restoration**
   * 
   * *For any* chat session, closing and reopening the sidebar should restore 
   * the same session.
   * 
   * **Validates: Requirements 8.4**
   */
  it('Property 29: Session restoration', () => {
    fc.assert(
      fc.property(
        arbitraryModelId(),
        fc.array(arbitraryMessageInput(), { minLength: 0, maxLength: 10 }),
        fc.array(arbitraryContextItem(), { minLength: 0, maxLength: 5 }),
        (modelId, messageInputs, contextItems) => {
          // Create manager and session
          const manager = new ChatStateManager();
          const session = manager.createSession(modelId);

          // Add messages to the session
          for (const input of messageInputs) {
            manager.addMessage(session.id, input);
          }

          // Add context items to the session
          for (const item of contextItems) {
            manager.addContextItem(session.id, item);
          }

          // Export state (simulating close)
          const exportedState = manager.exportState();

          // Create new manager and load state (simulating reopen)
          const newManager = new ChatStateManager();
          newManager.loadState(exportedState.sessions, exportedState.currentSessionId);

          // Verify current session is restored
          const restoredSession = newManager.getCurrentSession();
          expect(restoredSession).not.toBeNull();
          expect(restoredSession!.id).toBe(session.id);
          expect(restoredSession!.currentModelId).toBe(modelId);

          // Verify messages are restored
          const restoredMessages = newManager.getMessages(session.id);
          expect(restoredMessages.length).toBe(messageInputs.length);

          // Verify context items are restored
          const restoredContextItems = newManager.getContextItems(session.id);
          expect(restoredContextItems.length).toBe(contextItems.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('ChatStateManager - History Persistence', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 30: History persistence**
   * 
   * *For any* chat history, it should be retrievable after plugin reload.
   * 
   * **Validates: Requirements 8.5**
   */
  it('Property 30: History persistence', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            arbitraryModelId(),
            fc.array(arbitraryMessageInput(), { minLength: 1, maxLength: 5 })
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (sessionData) => {
          // Create manager
          const manager = new ChatStateManager();

          // Create multiple sessions with messages
          const createdSessions: { id: string; messageCount: number }[] = [];
          for (const [modelId, messageInputs] of sessionData) {
            const session = manager.createSession(modelId);
            for (const input of messageInputs) {
              manager.addMessage(session.id, input);
            }
            createdSessions.push({ id: session.id, messageCount: messageInputs.length });
          }

          // Export state (simulating save to disk)
          const exportedState = manager.exportState();

          // Create new manager and load state (simulating plugin reload)
          const newManager = new ChatStateManager();
          newManager.loadState(exportedState.sessions, exportedState.currentSessionId);

          // Verify all sessions and their histories are retrievable
          for (const { id, messageCount } of createdSessions) {
            const session = newManager.getSession(id);
            // Session might have been pruned if we exceeded MAX_SESSIONS
            if (session) {
              const messages = newManager.getMessages(id);
              expect(messages.length).toBe(messageCount);
            }
          }

          // Verify at least the current session is preserved
          const currentSession = newManager.getCurrentSession();
          expect(currentSession).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('ChatStateManager - Unit Tests', () => {
  describe('Session Creation and Management', () => {
    it('should create a new session with empty messages', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      expect(session.id).toBeDefined();
      expect(session.messages).toHaveLength(0);
      expect(session.contextItems).toHaveLength(0);
      expect(session.currentModelId).toBe('model-1');
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it('should set new session as current session', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      expect(manager.getCurrentSessionId()).toBe(session.id);
      expect(manager.getCurrentSession()?.id).toBe(session.id);
    });

    it('should get session by ID', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const retrieved = manager.getSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
    });

    it('should return null for non-existent session', () => {
      const manager = new ChatStateManager();
      const retrieved = manager.getSession('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should get all sessions', () => {
      const manager = new ChatStateManager();
      manager.createSession('model-1');
      manager.createSession('model-2');

      const sessions = manager.getAllSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should switch to a different session', () => {
      const manager = new ChatStateManager();
      const session1 = manager.createSession('model-1');
      const session2 = manager.createSession('model-2');

      expect(manager.getCurrentSessionId()).toBe(session2.id);

      const switched = manager.switchSession(session1.id);
      expect(switched).toBe(true);
      expect(manager.getCurrentSessionId()).toBe(session1.id);
    });

    it('should return false when switching to non-existent session', () => {
      const manager = new ChatStateManager();
      manager.createSession('model-1');

      const switched = manager.switchSession('non-existent');
      expect(switched).toBe(false);
    });

    it('should clear session messages', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');
      manager.addMessage(session.id, { role: 'user', content: 'Hello' });

      expect(manager.getMessages(session.id)).toHaveLength(1);

      const cleared = manager.clearSession(session.id);
      expect(cleared).toBe(true);
      expect(manager.getMessages(session.id)).toHaveLength(0);
    });

    it('should delete a session', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const deleted = manager.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(manager.getSession(session.id)).toBeNull();
    });

    it('should switch to most recent session after deleting current', () => {
      const manager = new ChatStateManager();
      const session1 = manager.createSession('model-1');
      const session2 = manager.createSession('model-2');

      expect(manager.getCurrentSessionId()).toBe(session2.id);

      manager.deleteSession(session2.id);
      expect(manager.getCurrentSessionId()).toBe(session1.id);
    });
  });

  describe('Message Addition', () => {
    it('should add a user message to session', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const message = manager.addMessage(session.id, {
        role: 'user',
        content: 'Hello, AI!',
      });

      expect(message).not.toBeNull();
      expect(message!.id).toBeDefined();
      expect(message!.role).toBe('user');
      expect(message!.content).toBe('Hello, AI!');
      expect(message!.timestamp).toBeDefined();
    });

    it('should add an assistant message to session', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const message = manager.addMessage(session.id, {
        role: 'assistant',
        content: 'Hello! How can I help you?',
        modelId: 'model-1',
      });

      expect(message).not.toBeNull();
      expect(message!.role).toBe('assistant');
      expect(message!.modelId).toBe('model-1');
    });

    it('should return null when adding message to non-existent session', () => {
      const manager = new ChatStateManager();

      const message = manager.addMessage('non-existent', {
        role: 'user',
        content: 'Hello',
      });

      expect(message).toBeNull();
    });

    it('should update session updatedAt when adding message', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');
      const originalUpdatedAt = session.updatedAt;

      // Small delay to ensure timestamp difference
      const message = manager.addMessage(session.id, {
        role: 'user',
        content: 'Hello',
      });

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');
      manager.addMessage(session.id, { role: 'user', content: 'Hello' });

      const exported = manager.exportState();

      expect(exported.sessions).toHaveLength(1);
      expect(exported.currentSessionId).toBe(session.id);
      expect(exported.sessions[0].messages).toHaveLength(1);
    });

    it('should load state correctly', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');
      manager.addMessage(session.id, { role: 'user', content: 'Hello' });

      const exported = manager.exportState();

      const newManager = new ChatStateManager();
      newManager.loadState(exported.sessions, exported.currentSessionId);

      expect(newManager.getCurrentSessionId()).toBe(session.id);
      expect(newManager.getMessages(session.id)).toHaveLength(1);
    });

    it('should handle loading with invalid current session ID', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const exported = manager.exportState();

      const newManager = new ChatStateManager();
      newManager.loadState(exported.sessions, 'invalid-id');

      // Should fall back to first session
      expect(newManager.getCurrentSessionId()).toBe(session.id);
    });

    it('should call save callback when saveState is called', async () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      let savedSessions: any = null;
      let savedCurrentId: any = null;

      manager.setSaveCallback(async (sessions, currentId) => {
        savedSessions = sessions;
        savedCurrentId = currentId;
      });

      await manager.saveState();

      expect(savedSessions).toHaveLength(1);
      expect(savedCurrentId).toBe(session.id);
    });
  });

  describe('Session Switching', () => {
    it('should preserve messages when switching sessions', () => {
      const manager = new ChatStateManager();
      const session1 = manager.createSession('model-1');
      manager.addMessage(session1.id, { role: 'user', content: 'Message 1' });

      const session2 = manager.createSession('model-2');
      manager.addMessage(session2.id, { role: 'user', content: 'Message 2' });

      // Switch back to session1
      manager.switchSession(session1.id);

      // Verify both sessions still have their messages
      expect(manager.getMessages(session1.id)).toHaveLength(1);
      expect(manager.getMessages(session1.id)[0].content).toBe('Message 1');
      expect(manager.getMessages(session2.id)).toHaveLength(1);
      expect(manager.getMessages(session2.id)[0].content).toBe('Message 2');
    });
  });

  describe('Context Item Management', () => {
    it('should add context item to session', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const contextItem: ContextItem = {
        id: 'ctx-1',
        type: 'file',
        path: '/path/to/file.md',
        content: 'File content',
        displayName: 'file.md',
      };

      const added = manager.addContextItem(session.id, contextItem);
      expect(added).toBe(true);

      const items = manager.getContextItems(session.id);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('ctx-1');
    });

    it('should remove context item from session', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const contextItem: ContextItem = {
        id: 'ctx-1',
        type: 'file',
        path: '/path/to/file.md',
        content: 'File content',
        displayName: 'file.md',
      };

      manager.addContextItem(session.id, contextItem);
      expect(manager.getContextItems(session.id)).toHaveLength(1);

      const removed = manager.removeContextItem(session.id, 'ctx-1');
      expect(removed).toBe(true);
      expect(manager.getContextItems(session.id)).toHaveLength(0);
    });

    it('should return false when removing non-existent context item', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const removed = manager.removeContextItem(session.id, 'non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Model Operations', () => {
    it('should update session model', () => {
      const manager = new ChatStateManager();
      const session = manager.createSession('model-1');

      const updated = manager.setSessionModel(session.id, 'model-2');
      expect(updated).toBe(true);

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession!.currentModelId).toBe('model-2');
    });

    it('should return false when updating model for non-existent session', () => {
      const manager = new ChatStateManager();

      const updated = manager.setSessionModel('non-existent', 'model-2');
      expect(updated).toBe(false);
    });
  });
});
