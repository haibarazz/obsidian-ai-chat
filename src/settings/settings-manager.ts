/**
 * Settings Manager for the AI Chat Sidebar plugin
 * Handles provider and model CRUD operations, persistence, and validation
 * 
 * Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { AIProvider, AIModel, PluginSettings, ChatSession } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { validateProvider, validateModel } from './validation';

/**
 * Generates a unique ID for providers, models, and sessions
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * SettingsManager class handles all settings operations
 * Provides CRUD operations for providers and models with validation
 */
export class SettingsManager {
  private settings: PluginSettings;
  private saveCallback: ((settings: PluginSettings) => Promise<void>) | null = null;

  constructor(initialSettings?: Partial<PluginSettings>) {
    // Deep copy DEFAULT_SETTINGS to avoid mutating the original
    this.settings = {
      providers: [...(initialSettings?.providers ?? DEFAULT_SETTINGS.providers)],
      models: [...(initialSettings?.models ?? DEFAULT_SETTINGS.models)],
      sessions: [...(initialSettings?.sessions ?? DEFAULT_SETTINGS.sessions)],
      currentSessionId: initialSettings?.currentSessionId ?? DEFAULT_SETTINGS.currentSessionId,
      maxHistorySize: initialSettings?.maxHistorySize ?? DEFAULT_SETTINGS.maxHistorySize,
      streamingEnabled: initialSettings?.streamingEnabled ?? DEFAULT_SETTINGS.streamingEnabled,
    };
  }

  /**
   * Sets the callback function for persisting settings
   */
  setSaveCallback(callback: (settings: PluginSettings) => Promise<void>): void {
    this.saveCallback = callback;
  }

  /**
   * Gets the current settings
   */
  getSettings(): PluginSettings {
    return { ...this.settings };
  }

  /**
   * Loads settings from provided data
   */
  loadSettings(data: Partial<PluginSettings>): void {
    // Deep copy to avoid mutating the original
    this.settings = {
      providers: [...(data.providers ?? DEFAULT_SETTINGS.providers)],
      models: [...(data.models ?? DEFAULT_SETTINGS.models)],
      sessions: [...(data.sessions ?? DEFAULT_SETTINGS.sessions)],
      currentSessionId: data.currentSessionId ?? DEFAULT_SETTINGS.currentSessionId,
      maxHistorySize: data.maxHistorySize ?? DEFAULT_SETTINGS.maxHistorySize,
      streamingEnabled: data.streamingEnabled ?? DEFAULT_SETTINGS.streamingEnabled,
    };
  }


  /**
   * Saves settings using the registered callback
   * Requirements: 2.3 - WHEN the user saves provider configuration THEN the Plugin SHALL persist the settings securely
   */
  async saveSettings(): Promise<void> {
    if (this.saveCallback) {
      await this.saveCallback(this.settings);
    }
  }

  // ==================== Provider Operations ====================

  /**
   * Gets all providers
   * Requirements: 2.1 - WHEN the user opens plugin settings THEN the Plugin SHALL display a provider management interface
   */
  getProviders(): AIProvider[] {
    return [...this.settings.providers];
  }

  /**
   * Gets a provider by ID
   */
  getProvider(id: string): AIProvider | undefined {
    return this.settings.providers.find(p => p.id === id);
  }

  /**
   * Gets all enabled providers
   */
  getEnabledProviders(): AIProvider[] {
    return this.settings.providers.filter(p => p.enabled);
  }

  /**
   * Adds a new provider
   * Requirements: 2.2 - WHEN the user adds a new provider THEN the Plugin SHALL require a provider name, base URL, and API key
   */
  addProvider(provider: Omit<AIProvider, 'id'>): { success: boolean; provider?: AIProvider; errors?: string[] } {
    const validation = validateProvider(provider);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const newProvider: AIProvider = {
      ...provider,
      id: generateId(),
    };

    this.settings.providers.push(newProvider);
    return { success: true, provider: newProvider };
  }

  /**
   * Updates an existing provider
   */
  updateProvider(id: string, updates: Partial<Omit<AIProvider, 'id'>>): { success: boolean; provider?: AIProvider; errors?: string[] } {
    const index = this.settings.providers.findIndex(p => p.id === id);
    if (index === -1) {
      return { success: false, errors: ['Provider not found'] };
    }

    const updatedProvider = { ...this.settings.providers[index], ...updates };
    const validation = validateProvider(updatedProvider);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    this.settings.providers[index] = updatedProvider;
    return { success: true, provider: updatedProvider };
  }

  /**
   * Deletes a provider and its associated models
   */
  deleteProvider(id: string): boolean {
    const index = this.settings.providers.findIndex(p => p.id === id);
    if (index === -1) {
      return false;
    }

    // Remove the provider
    this.settings.providers.splice(index, 1);

    // Remove all models associated with this provider
    this.settings.models = this.settings.models.filter(m => m.providerId !== id);

    return true;
  }

  /**
   * Toggles provider enabled state
   * Requirements: 2.4 - WHEN the user enables or disables a provider THEN the Plugin SHALL update the available models list accordingly
   */
  toggleProvider(id: string): { success: boolean; enabled?: boolean } {
    const provider = this.settings.providers.find(p => p.id === id);
    if (!provider) {
      return { success: false };
    }

    provider.enabled = !provider.enabled;
    return { success: true, enabled: provider.enabled };
  }


  // ==================== Model Operations ====================

  /**
   * Gets all models
   * Requirements: 3.1 - WHEN the user opens model management THEN the Plugin SHALL display all configured models grouped by provider
   */
  getModels(): AIModel[] {
    return [...this.settings.models];
  }

  /**
   * Gets a model by ID
   */
  getModel(id: string): AIModel | undefined {
    return this.settings.models.find(m => m.id === id);
  }

  /**
   * Gets models for a specific provider
   */
  getModelsByProvider(providerId: string): AIModel[] {
    return this.settings.models.filter(m => m.providerId === providerId);
  }

  /**
   * Gets all available models (from enabled providers only)
   * Requirements: 2.4 - WHEN the user enables or disables a provider THEN the Plugin SHALL update the available models list accordingly
   */
  getAvailableModels(): AIModel[] {
    const enabledProviderIds = new Set(
      this.settings.providers.filter(p => p.enabled).map(p => p.id)
    );
    return this.settings.models.filter(m => enabledProviderIds.has(m.providerId));
  }

  /**
   * Adds a new model
   * Requirements: 3.2 - WHEN the user adds a new model THEN the Plugin SHALL require a model name, provider association, and model identifier
   * Requirements: 3.3 - WHEN the user saves a model configuration THEN the Plugin SHALL make the model available in the chat interface
   */
  addModel(model: Omit<AIModel, 'id'>): { success: boolean; model?: AIModel; errors?: string[] } {
    const validation = validateModel(model);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Verify provider exists
    const provider = this.settings.providers.find(p => p.id === model.providerId);
    if (!provider) {
      return { success: false, errors: ['Provider not found'] };
    }

    const newModel: AIModel = {
      ...model,
      id: generateId(),
    };

    // If this is set as default, unset other defaults
    if (newModel.isDefault) {
      this.settings.models.forEach(m => { m.isDefault = false; });
    }

    this.settings.models.push(newModel);
    return { success: true, model: newModel };
  }

  /**
   * Updates an existing model
   */
  updateModel(id: string, updates: Partial<Omit<AIModel, 'id'>>): { success: boolean; model?: AIModel; errors?: string[] } {
    const index = this.settings.models.findIndex(m => m.id === id);
    if (index === -1) {
      return { success: false, errors: ['Model not found'] };
    }

    const updatedModel = { ...this.settings.models[index], ...updates };
    const validation = validateModel(updatedModel);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // If provider is being changed, verify new provider exists
    if (updates.providerId) {
      const provider = this.settings.providers.find(p => p.id === updates.providerId);
      if (!provider) {
        return { success: false, errors: ['Provider not found'] };
      }
    }

    // If this is set as default, unset other defaults
    if (updates.isDefault) {
      this.settings.models.forEach(m => { m.isDefault = false; });
    }

    this.settings.models[index] = updatedModel;
    return { success: true, model: updatedModel };
  }

  /**
   * Deletes a model
   * Requirements: 3.4 - WHEN the user deletes a model THEN the Plugin SHALL remove it from the available models list
   */
  deleteModel(id: string): boolean {
    const index = this.settings.models.findIndex(m => m.id === id);
    if (index === -1) {
      return false;
    }

    this.settings.models.splice(index, 1);
    return true;
  }

  /**
   * Sets a model as the default
   * Requirements: 3.5 - WHEN the user sets a default model THEN the Plugin SHALL use that model for new chat sessions
   */
  setDefaultModel(id: string): boolean {
    const model = this.settings.models.find(m => m.id === id);
    if (!model) {
      return false;
    }

    // Unset all other defaults
    this.settings.models.forEach(m => { m.isDefault = false; });
    model.isDefault = true;
    return true;
  }

  /**
   * Gets the default model
   */
  getDefaultModel(): AIModel | undefined {
    return this.settings.models.find(m => m.isDefault);
  }


  // ==================== Session Operations ====================

  /**
   * Gets all sessions
   */
  getSessions(): ChatSession[] {
    return [...this.settings.sessions];
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.settings.currentSessionId;
  }

  /**
   * Sets the current session ID
   */
  setCurrentSessionId(id: string | null): void {
    this.settings.currentSessionId = id;
  }

  /**
   * Creates a new session using the default model
   * Requirements: 3.5 - WHEN the user sets a default model THEN the Plugin SHALL use that model for new chat sessions
   */
  createSession(): ChatSession {
    const defaultModel = this.getDefaultModel();
    const availableModels = this.getAvailableModels();
    
    // Use default model if available, otherwise first available model, otherwise empty string
    const modelId = defaultModel?.id ?? availableModels[0]?.id ?? '';

    const session: ChatSession = {
      id: generateId(),
      messages: [],
      contextItems: [],
      currentModelId: modelId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.settings.sessions.push(session);
    this.settings.currentSessionId = session.id;

    return session;
  }

  // ==================== General Settings ====================

  /**
   * Gets the max history size
   */
  getMaxHistorySize(): number {
    return this.settings.maxHistorySize;
  }

  /**
   * Sets the max history size
   */
  setMaxHistorySize(size: number): void {
    this.settings.maxHistorySize = Math.max(1, size);
  }

  /**
   * Gets streaming enabled state
   */
  isStreamingEnabled(): boolean {
    return this.settings.streamingEnabled;
  }

  /**
   * Sets streaming enabled state
   */
  setStreamingEnabled(enabled: boolean): void {
    this.settings.streamingEnabled = enabled;
  }
}
