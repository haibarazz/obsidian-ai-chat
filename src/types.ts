/**
 * Core TypeScript interfaces for the AI Chat Sidebar plugin
 */

/**
 * Represents an AI service provider configuration
 */
export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  type: 'openai' | 'anthropic' | 'custom';
}

/**
 * Represents an AI model configuration
 */
export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  modelIdentifier: string; // e.g., "gpt-4", "claude-3-opus"
  isDefault: boolean;
}

/**
 * Represents a single message in a chat conversation
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelId?: string;
}

/**
 * Represents a context item (file, folder, or text selection) included in conversation
 */
export interface ContextItem {
  id: string;
  type: 'file' | 'folder' | 'selection';
  path?: string; // for file/folder
  content: string;
  displayName: string;
}

/**
 * Represents a chat session containing messages and context
 */
export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  contextItems: ContextItem[];
  currentModelId: string;
  createdAt: number;
  updatedAt: number;
}


/**
 * Plugin settings containing all configuration data
 */
export interface PluginSettings {
  providers: AIProvider[];
  models: AIModel[];
  currentSessionId: string | null;
  sessions: ChatSession[];
  maxHistorySize: number;
  streamingEnabled: boolean;
}

/**
 * Validation result for provider configuration
 */
export interface ProviderValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validation result for model configuration
 */
export interface ModelValidationResult {
  valid: boolean;
  errors: string[];
}
