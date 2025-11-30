/**
 * Constants and default values for the AI Chat Sidebar plugin
 */

import type { PluginSettings } from './types';

/**
 * Unique identifier for the chat view
 */
export const VIEW_TYPE_CHAT = 'ai-chat-sidebar-view';

/**
 * Plugin display name
 */
export const PLUGIN_NAME = 'AI Chat Sidebar';

/**
 * Default settings for the plugin
 */
export const DEFAULT_SETTINGS: PluginSettings = {
  providers: [],
  models: [],
  currentSessionId: null,
  sessions: [],
  maxHistorySize: 50,
  streamingEnabled: true,
};

/**
 * Maximum number of sessions to keep
 */
export const MAX_SESSIONS = 10;

/**
 * API request timeouts in milliseconds
 */
export const API_TIMEOUT_NON_STREAMING = 30000; // 30 seconds
export const API_TIMEOUT_STREAMING = 60000; // 60 seconds

/**
 * Retry configuration for API requests
 */
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_BASE = 1000; // 1 second base for exponential backoff

/**
 * Supported provider types
 */
export const PROVIDER_TYPES = ['openai', 'anthropic', 'custom'] as const;
