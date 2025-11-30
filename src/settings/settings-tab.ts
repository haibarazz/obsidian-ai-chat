/**
 * Settings Tab UI for the AI Chat Sidebar plugin
 * Provides UI for managing providers, models, and general settings
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { Plugin } from 'obsidian';
import type { AIProvider, AIModel } from '../types';
import { SettingsManager } from './settings-manager';
import { PROVIDER_TYPES } from '../constants';

/**
 * Settings tab for the AI Chat Sidebar plugin
 * Displays provider management, model management, and general settings
 */
export class AISettingsTab extends PluginSettingTab {
  private settingsManager: SettingsManager;
  private saveCallback: () => Promise<void>;

  constructor(
    app: App,
    plugin: Plugin,
    settingsManager: SettingsManager,
    saveCallback: () => Promise<void>
  ) {
    super(app, plugin);
    this.settingsManager = settingsManager;
    this.saveCallback = saveCallback;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Header
    containerEl.createEl('h1', { text: 'AI Chat Sidebar settings' });

    // Provider Management Section
    this.renderProviderSection(containerEl);

    // Model Management Section
    this.renderModelSection(containerEl);

    // General Settings Section
    this.renderGeneralSettingsSection(containerEl);
  }


  // ==================== Provider Section ====================

  /**
   * Renders the provider management section
   * Requirements: 2.1 - WHEN the user opens plugin settings THEN the Plugin SHALL display a provider management interface
   */
  private renderProviderSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'AI Providers' });
    containerEl.createEl('p', { 
      text: 'Configure AI service providers with their API endpoints and keys.',
      cls: 'setting-item-description'
    });

    // Add Provider button
    new Setting(containerEl)
      .setName('Add new provider')
      .setDesc('Add a new AI provider configuration')
      .addButton(button => button
        .setButtonText('Add provider')
        .setCta()
        .onClick(() => this.showAddProviderModal()));

    // List existing providers
    const providers = this.settingsManager.getProviders();
    
    if (providers.length === 0) {
      containerEl.createEl('p', { 
        text: 'No providers configured. Add a provider to get started.',
        cls: 'setting-item-description'
      });
    } else {
      const providerListEl = containerEl.createDiv({ cls: 'ai-chat-provider-list' });
      providers.forEach(provider => this.renderProviderItem(providerListEl, provider));
    }
  }

  /**
   * Renders a single provider item with edit, delete, and toggle controls
   */
  private renderProviderItem(containerEl: HTMLElement, provider: AIProvider): void {
    const setting = new Setting(containerEl)
      .setName(provider.name)
      .setDesc(`${provider.type} • ${provider.baseUrl} • API Key: ${this.maskApiKey(provider.apiKey)}`);

    // Enable/Disable toggle
    // Requirements: 2.4 - WHEN the user enables or disables a provider THEN the Plugin SHALL update the available models list accordingly
    setting.addToggle(toggle => toggle
      .setValue(provider.enabled)
      .setTooltip(provider.enabled ? 'Disable provider' : 'Enable provider')
      .onChange(async (value) => {
        this.settingsManager.toggleProvider(provider.id);
        await this.saveCallback();
        new Notice(`Provider ${provider.name} ${value ? 'enabled' : 'disabled'}`);
      }));

    // Edit button
    setting.addButton(button => button
      .setIcon('pencil')
      .setTooltip('Edit provider')
      .onClick(() => this.showEditProviderModal(provider)));

    // Delete button
    setting.addButton(button => button
      .setIcon('trash')
      .setTooltip('Delete provider')
      .setWarning()
      .onClick(async () => {
        if (await this.confirmDelete(`Delete provider "${provider.name}"? This will also delete all associated models.`)) {
          this.settingsManager.deleteProvider(provider.id);
          await this.saveCallback();
          new Notice(`Provider ${provider.name} deleted`);
          this.display();
        }
      }));
  }

  /**
   * Shows modal for adding a new provider
   * Requirements: 2.2 - WHEN the user adds a new provider THEN the Plugin SHALL require a provider name, base URL, and API key
   */
  private showAddProviderModal(): void {
    const modal = new ProviderModal(
      this.app,
      null,
      async (provider) => {
        const result = this.settingsManager.addProvider(provider);
        if (result.success) {
          await this.saveCallback();
          new Notice(`Provider ${provider.name} added`);
          this.display();
        } else {
          new Notice(`Error: ${result.errors?.join(', ')}`);
        }
      }
    );
    modal.open();
  }

  /**
   * Shows modal for editing an existing provider
   */
  private showEditProviderModal(provider: AIProvider): void {
    const modal = new ProviderModal(
      this.app,
      provider,
      async (updates) => {
        const result = this.settingsManager.updateProvider(provider.id, updates);
        if (result.success) {
          await this.saveCallback();
          new Notice(`Provider ${updates.name} updated`);
          this.display();
        } else {
          new Notice(`Error: ${result.errors?.join(', ')}`);
        }
      }
    );
    modal.open();
  }


  // ==================== Model Section ====================

  /**
   * Renders the model management section
   * Requirements: 3.1 - WHEN the user opens model management THEN the Plugin SHALL display all configured models grouped by provider
   */
  private renderModelSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'AI Models' });
    containerEl.createEl('p', { 
      text: 'Configure AI models for each provider.',
      cls: 'setting-item-description'
    });

    const providers = this.settingsManager.getProviders();

    if (providers.length === 0) {
      containerEl.createEl('p', { 
        text: 'Add a provider first before configuring models.',
        cls: 'setting-item-description'
      });
      return;
    }

    // Add Model button
    new Setting(containerEl)
      .setName('Add new model')
      .setDesc('Add a new AI model configuration')
      .addButton(button => button
        .setButtonText('Add model')
        .setCta()
        .onClick(() => this.showAddModelModal()));

    // Group models by provider
    // Requirements: 3.1 - display all configured models grouped by provider
    providers.forEach(provider => {
      const models = this.settingsManager.getModelsByProvider(provider.id);
      
      if (models.length > 0) {
        containerEl.createEl('h3', { 
          text: `${provider.name} ${provider.enabled ? '' : '(disabled)'}`,
          cls: provider.enabled ? '' : 'ai-chat-disabled-provider'
        });
        
        const modelListEl = containerEl.createDiv({ cls: 'ai-chat-model-list' });
        models.forEach(model => this.renderModelItem(modelListEl, model, provider));
      }
    });

    // Show message if no models configured
    const allModels = this.settingsManager.getModels();
    if (allModels.length === 0) {
      containerEl.createEl('p', { 
        text: 'No models configured. Add a model to start chatting.',
        cls: 'setting-item-description'
      });
    }
  }

  /**
   * Renders a single model item with edit, delete, and set default controls
   */
  private renderModelItem(containerEl: HTMLElement, model: AIModel, _provider: AIProvider): void {
    const defaultBadge = model.isDefault ? ' ⭐ Default' : '';
    
    const setting = new Setting(containerEl)
      .setName(`${model.name}${defaultBadge}`)
      .setDesc(`Model ID: ${model.modelIdentifier}`);

    // Set as default button
    // Requirements: 3.5 - WHEN the user sets a default model THEN the Plugin SHALL use that model for new chat sessions
    if (!model.isDefault) {
      setting.addButton(button => button
        .setButtonText('Set default')
        .setTooltip('Use this model for new chat sessions')
        .onClick(async () => {
          this.settingsManager.setDefaultModel(model.id);
          await this.saveCallback();
          new Notice(`${model.name} set as default model`);
          this.display();
        }));
    }

    // Edit button
    setting.addButton(button => button
      .setIcon('pencil')
      .setTooltip('Edit model')
      .onClick(() => this.showEditModelModal(model)));

    // Delete button
    // Requirements: 3.4 - WHEN the user deletes a model THEN the Plugin SHALL remove it from the available models list
    setting.addButton(button => button
      .setIcon('trash')
      .setTooltip('Delete model')
      .setWarning()
      .onClick(async () => {
        if (await this.confirmDelete(`Delete model "${model.name}"?`)) {
          this.settingsManager.deleteModel(model.id);
          await this.saveCallback();
          new Notice(`Model ${model.name} deleted`);
          this.display();
        }
      }));
  }

  /**
   * Shows modal for adding a new model
   * Requirements: 3.2 - WHEN the user adds a new model THEN the Plugin SHALL require a model name, provider association, and model identifier
   */
  private showAddModelModal(): void {
    const providers = this.settingsManager.getProviders();
    const modal = new ModelModal(
      this.app,
      null,
      providers,
      async (model) => {
        const result = this.settingsManager.addModel(model);
        if (result.success) {
          // Requirements: 3.3 - WHEN the user saves a model configuration THEN the Plugin SHALL make the model available in the chat interface
          await this.saveCallback();
          new Notice(`Model ${model.name} added`);
          this.display();
        } else {
          new Notice(`Error: ${result.errors?.join(', ')}`);
        }
      }
    );
    modal.open();
  }

  /**
   * Shows modal for editing an existing model
   */
  private showEditModelModal(model: AIModel): void {
    const providers = this.settingsManager.getProviders();
    const modal = new ModelModal(
      this.app,
      model,
      providers,
      async (updates) => {
        const result = this.settingsManager.updateModel(model.id, updates);
        if (result.success) {
          await this.saveCallback();
          new Notice(`Model ${updates.name} updated`);
          this.display();
        } else {
          new Notice(`Error: ${result.errors?.join(', ')}`);
        }
      }
    );
    modal.open();
  }


  // ==================== General Settings Section ====================

  /**
   * Renders the general settings section
   */
  private renderGeneralSettingsSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'General settings' });

    // Max history size
    new Setting(containerEl)
      .setName('Max history size')
      .setDesc('Maximum number of messages to keep in chat history per session')
      .addText(text => text
        .setPlaceholder('50')
        .setValue(String(this.settingsManager.getMaxHistorySize()))
        .onChange(async (value) => {
          const size = parseInt(value, 10);
          if (!isNaN(size) && size > 0) {
            this.settingsManager.setMaxHistorySize(size);
            await this.saveCallback();
          }
        }));

    // Streaming toggle
    new Setting(containerEl)
      .setName('Enable streaming')
      .setDesc('Show AI responses as they are generated (requires provider support)')
      .addToggle(toggle => toggle
        .setValue(this.settingsManager.isStreamingEnabled())
        .onChange(async (value) => {
          this.settingsManager.setStreamingEnabled(value);
          await this.saveCallback();
        }));
  }

  // ==================== Helper Methods ====================

  /**
   * Masks an API key for display, showing only the last 4 characters
   */
  private maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length <= 4) {
      return '****';
    }
    return `****${apiKey.slice(-4)}`;
  }

  /**
   * Shows a confirmation dialog for delete operations
   */
  private async confirmDelete(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmModal(this.app, message, resolve);
      modal.open();
    });
  }
}


// ==================== Modal Classes ====================

import { Modal } from 'obsidian';

/**
 * Confirmation modal for delete operations
 */
class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: (confirmed: boolean) => void;

  constructor(app: App, message: string, onConfirm: (confirmed: boolean) => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: 'Confirm deletion' });
    contentEl.createEl('p', { text: this.message });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.onConfirm(false);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl('button', { 
      text: 'Delete',
      cls: 'mod-warning'
    });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm(true);
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal for adding/editing a provider
 * Requirements: 2.2 - WHEN the user adds a new provider THEN the Plugin SHALL require a provider name, base URL, and API key
 */
class ProviderModal extends Modal {
  private provider: AIProvider | null;
  private onSave: (provider: Omit<AIProvider, 'id'>) => Promise<void>;
  
  private nameValue: string = '';
  private baseUrlValue: string = '';
  private apiKeyValue: string = '';
  private typeValue: 'openai' | 'anthropic' | 'custom' = 'openai';
  private enabledValue: boolean = true;

  constructor(
    app: App,
    provider: AIProvider | null,
    onSave: (provider: Omit<AIProvider, 'id'>) => Promise<void>
  ) {
    super(app);
    this.provider = provider;
    this.onSave = onSave;

    // Initialize values from existing provider if editing
    if (provider) {
      this.nameValue = provider.name;
      this.baseUrlValue = provider.baseUrl;
      this.apiKeyValue = provider.apiKey;
      this.typeValue = provider.type;
      this.enabledValue = provider.enabled;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const title = this.provider ? 'Edit provider' : 'Add provider';
    contentEl.createEl('h2', { text: title });

    // Provider name
    new Setting(contentEl)
      .setName('Provider name')
      .setDesc('A friendly name for this provider')
      .addText(text => text
        .setPlaceholder('e.g., OpenAI')
        .setValue(this.nameValue)
        .onChange(value => { this.nameValue = value; }));

    // Provider type
    new Setting(contentEl)
      .setName('Provider type')
      .setDesc('The type of API this provider uses')
      .addDropdown(dropdown => {
        PROVIDER_TYPES.forEach(type => {
          dropdown.addOption(type, type.charAt(0).toUpperCase() + type.slice(1));
        });
        dropdown.setValue(this.typeValue);
        dropdown.onChange(value => { 
          this.typeValue = value as 'openai' | 'anthropic' | 'custom'; 
        });
      });

    // Base URL
    new Setting(contentEl)
      .setName('Base URL')
      .setDesc('The API endpoint URL')
      .addText(text => text
        .setPlaceholder('e.g., https://api.openai.com/v1')
        .setValue(this.baseUrlValue)
        .onChange(value => { this.baseUrlValue = value; }));

    // API Key (masked input)
    new Setting(contentEl)
      .setName('API key')
      .setDesc('Your API key for this provider')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('Enter API key')
          .setValue(this.apiKeyValue)
          .onChange(value => { this.apiKeyValue = value; });
      });

    // Enabled toggle
    new Setting(contentEl)
      .setName('Enabled')
      .setDesc('Enable or disable this provider')
      .addToggle(toggle => toggle
        .setValue(this.enabledValue)
        .onChange(value => { this.enabledValue = value; }));

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = buttonContainer.createEl('button', { 
      text: 'Save',
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', async () => {
      await this.onSave({
        name: this.nameValue,
        baseUrl: this.baseUrlValue,
        apiKey: this.apiKeyValue,
        type: this.typeValue,
        enabled: this.enabledValue,
      });
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}


/**
 * Modal for adding/editing a model
 * Requirements: 3.2 - WHEN the user adds a new model THEN the Plugin SHALL require a model name, provider association, and model identifier
 */
class ModelModal extends Modal {
  private model: AIModel | null;
  private providers: AIProvider[];
  private onSave: (model: Omit<AIModel, 'id'>) => Promise<void>;
  
  private nameValue: string = '';
  private providerIdValue: string = '';
  private modelIdentifierValue: string = '';
  private isDefaultValue: boolean = false;

  constructor(
    app: App,
    model: AIModel | null,
    providers: AIProvider[],
    onSave: (model: Omit<AIModel, 'id'>) => Promise<void>
  ) {
    super(app);
    this.model = model;
    this.providers = providers;
    this.onSave = onSave;

    // Initialize values from existing model if editing
    if (model) {
      this.nameValue = model.name;
      this.providerIdValue = model.providerId;
      this.modelIdentifierValue = model.modelIdentifier;
      this.isDefaultValue = model.isDefault;
    } else if (providers.length > 0) {
      // Default to first provider for new models
      this.providerIdValue = providers[0].id;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const title = this.model ? 'Edit model' : 'Add model';
    contentEl.createEl('h2', { text: title });

    if (this.providers.length === 0) {
      contentEl.createEl('p', { 
        text: 'No providers available. Please add a provider first.',
        cls: 'setting-item-description'
      });
      
      const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
      const closeBtn = buttonContainer.createEl('button', { text: 'Close' });
      closeBtn.addEventListener('click', () => this.close());
      return;
    }

    // Model name
    new Setting(contentEl)
      .setName('Model name')
      .setDesc('A friendly name for this model')
      .addText(text => text
        .setPlaceholder('e.g., GPT-4')
        .setValue(this.nameValue)
        .onChange(value => { this.nameValue = value; }));

    // Provider selection
    new Setting(contentEl)
      .setName('Provider')
      .setDesc('The provider this model belongs to')
      .addDropdown(dropdown => {
        this.providers.forEach(provider => {
          dropdown.addOption(provider.id, provider.name);
        });
        dropdown.setValue(this.providerIdValue);
        dropdown.onChange(value => { this.providerIdValue = value; });
      });

    // Model identifier
    new Setting(contentEl)
      .setName('Model identifier')
      .setDesc('The model ID used in API requests (e.g., gpt-4, claude-3-opus)')
      .addText(text => text
        .setPlaceholder('e.g., gpt-4')
        .setValue(this.modelIdentifierValue)
        .onChange(value => { this.modelIdentifierValue = value; }));

    // Set as default toggle
    new Setting(contentEl)
      .setName('Set as default')
      .setDesc('Use this model for new chat sessions')
      .addToggle(toggle => toggle
        .setValue(this.isDefaultValue)
        .onChange(value => { this.isDefaultValue = value; }));

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = buttonContainer.createEl('button', { 
      text: 'Save',
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', async () => {
      await this.onSave({
        name: this.nameValue,
        providerId: this.providerIdValue,
        modelIdentifier: this.modelIdentifierValue,
        isDefault: this.isDefaultValue,
      });
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
