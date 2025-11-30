/**
 * Property-based tests for SettingsManager
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SettingsManager } from './settings-manager';
import type { AIProvider, AIModel } from '../types';

/**
 * Custom arbitrary for generating valid AIProvider objects (without id)
 */
const arbitraryProviderInput = (): fc.Arbitrary<Omit<AIProvider, 'id'>> =>
  fc.record({
    name: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    baseUrl: fc.webUrl(),
    apiKey: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    enabled: fc.boolean(),
    type: fc.constantFrom('openai', 'anthropic', 'custom') as fc.Arbitrary<'openai' | 'anthropic' | 'custom'>,
  });

describe('SettingsManager - Provider Operations', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 4: Provider configuration round-trip**
   * 
   * *For any* valid provider configuration, saving and reloading should produce 
   * an equivalent configuration.
   * 
   * **Validates: Requirements 2.3**
   */
  it('Property 4: Provider configuration round-trip', () => {
    fc.assert(
      fc.property(arbitraryProviderInput(), (providerInput) => {
        // Create fresh manager for each property run
        const manager = new SettingsManager();

        // Add provider
        const result = manager.addProvider(providerInput);
        expect(result.success).toBe(true);
        expect(result.provider).toBeDefined();

        const addedProvider = result.provider!;

        // Get settings and simulate save/reload
        const savedSettings = manager.getSettings();

        // Create new manager and load saved settings (simulating round-trip)
        const newManager = new SettingsManager();
        newManager.loadSettings(savedSettings);

        // Retrieve the provider from the reloaded manager
        const reloadedProvider = newManager.getProvider(addedProvider.id);

        // Verify round-trip preserves all fields
        expect(reloadedProvider).toBeDefined();
        expect(reloadedProvider!.id).toBe(addedProvider.id);
        expect(reloadedProvider!.name).toBe(providerInput.name);
        expect(reloadedProvider!.baseUrl).toBe(providerInput.baseUrl);
        expect(reloadedProvider!.apiKey).toBe(providerInput.apiKey);
        expect(reloadedProvider!.enabled).toBe(providerInput.enabled);
        expect(reloadedProvider!.type).toBe(providerInput.type);
      }),
      { numRuns: 100 }
    );
  });
});

describe('SettingsManager - Model List Reflects Provider State', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 5: Model list reflects provider state**
   * 
   * *For any* provider toggle (enable/disable), the available models list should 
   * include models only from enabled providers.
   * 
   * **Validates: Requirements 2.4**
   */
  it('Property 5: Model list reflects provider state', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryProviderInput(), { minLength: 1, maxLength: 5 }),
        (providerInputs) => {
          // Create fresh manager for each property run
          const manager = new SettingsManager();

          // Add all providers
          const addedProviders: AIProvider[] = [];
          for (const input of providerInputs) {
            const result = manager.addProvider(input);
            if (result.success && result.provider) {
              addedProviders.push(result.provider);
            }
          }

          // Add a model for each provider
          for (const provider of addedProviders) {
            manager.addModel({
              name: `Model for ${provider.name}`,
              providerId: provider.id,
              modelIdentifier: `model-${provider.id}`,
              isDefault: false,
            });
          }

          // Get available models (should only include models from enabled providers)
          const availableModels = manager.getAvailableModels();
          const enabledProviderIds = new Set(
            addedProviders.filter(p => p.enabled).map(p => p.id)
          );

          // Verify all available models belong to enabled providers
          for (const model of availableModels) {
            expect(enabledProviderIds.has(model.providerId)).toBe(true);
          }

          // Verify no models from disabled providers are in available list
          const disabledProviderIds = new Set(
            addedProviders.filter(p => !p.enabled).map(p => p.id)
          );
          for (const model of availableModels) {
            expect(disabledProviderIds.has(model.providerId)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('SettingsManager - Model Availability After Save', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 8: Model availability after save**
   * 
   * *For any* saved model configuration, the model should appear in the chat 
   * interface model selector.
   * 
   * **Validates: Requirements 3.3**
   */
  it('Property 8: Model availability after save', () => {
    fc.assert(
      fc.property(arbitraryProviderInput(), (providerInput) => {
        // Create fresh manager for each property run
        const manager = new SettingsManager();

        // First add a provider (required for model)
        const providerResult = manager.addProvider({ ...providerInput, enabled: true });
        expect(providerResult.success).toBe(true);
        const provider = providerResult.provider!;

        // Generate and add a model for this provider
        const modelInput = {
          name: 'Test Model',
          providerId: provider.id,
          modelIdentifier: 'test-model-id',
          isDefault: false,
        };

        const modelResult = manager.addModel(modelInput);
        expect(modelResult.success).toBe(true);
        const addedModel = modelResult.model!;

        // Simulate save/reload
        const savedSettings = manager.getSettings();
        const newManager = new SettingsManager();
        newManager.loadSettings(savedSettings);

        // Verify model appears in available models (provider is enabled)
        const availableModels = newManager.getAvailableModels();
        const foundModel = availableModels.find(m => m.id === addedModel.id);

        expect(foundModel).toBeDefined();
        expect(foundModel!.name).toBe(modelInput.name);
        expect(foundModel!.modelIdentifier).toBe(modelInput.modelIdentifier);
      }),
      { numRuns: 100 }
    );
  });
});

describe('SettingsManager - Model Removal Consistency', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 9: Model removal consistency**
   * 
   * *For any* model deletion, the model should no longer appear in any model 
   * selector or list.
   * 
   * **Validates: Requirements 3.4**
   */
  it('Property 9: Model removal consistency', () => {
    fc.assert(
      fc.property(arbitraryProviderInput(), (providerInput) => {
        // Create fresh manager for each property run
        const manager = new SettingsManager();

        // Add a provider
        const providerResult = manager.addProvider({ ...providerInput, enabled: true });
        expect(providerResult.success).toBe(true);
        const provider = providerResult.provider!;

        // Add a model
        const modelResult = manager.addModel({
          name: 'Model to Delete',
          providerId: provider.id,
          modelIdentifier: 'delete-me',
          isDefault: false,
        });
        expect(modelResult.success).toBe(true);
        const modelId = modelResult.model!.id;

        // Verify model exists
        expect(manager.getModel(modelId)).toBeDefined();
        expect(manager.getModels().some(m => m.id === modelId)).toBe(true);
        expect(manager.getAvailableModels().some(m => m.id === modelId)).toBe(true);

        // Delete the model
        const deleted = manager.deleteModel(modelId);
        expect(deleted).toBe(true);

        // Verify model no longer appears anywhere
        expect(manager.getModel(modelId)).toBeUndefined();
        expect(manager.getModels().some(m => m.id === modelId)).toBe(false);
        expect(manager.getAvailableModels().some(m => m.id === modelId)).toBe(false);
        expect(manager.getModelsByProvider(provider.id).some(m => m.id === modelId)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

describe('SettingsManager - Default Model Usage', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 10: Default model usage**
   * 
   * *For any* default model setting, newly created chat sessions should use 
   * that model as their initial model.
   * 
   * **Validates: Requirements 3.5**
   */
  it('Property 10: Default model usage', () => {
    fc.assert(
      fc.property(
        arbitraryProviderInput(),
        fc.integer({ min: 1, max: 5 }),
        (providerInput, modelCount) => {
          // Create fresh manager for each property run
          const manager = new SettingsManager();

          // Add a provider
          const providerResult = manager.addProvider({ ...providerInput, enabled: true });
          expect(providerResult.success).toBe(true);
          const provider = providerResult.provider!;

          // Add multiple models
          const addedModels: AIModel[] = [];
          for (let i = 0; i < modelCount; i++) {
            const modelResult = manager.addModel({
              name: `Model ${i}`,
              providerId: provider.id,
              modelIdentifier: `model-${i}`,
              isDefault: false,
            });
            if (modelResult.success && modelResult.model) {
              addedModels.push(modelResult.model);
            }
          }

          if (addedModels.length === 0) return; // Skip if no models added

          // Pick a random model to be default
          const defaultModelIndex = Math.floor(Math.random() * addedModels.length);
          const defaultModel = addedModels[defaultModelIndex];

          // Set it as default
          const setResult = manager.setDefaultModel(defaultModel.id);
          expect(setResult).toBe(true);

          // Verify it's the default
          const retrievedDefault = manager.getDefaultModel();
          expect(retrievedDefault).toBeDefined();
          expect(retrievedDefault!.id).toBe(defaultModel.id);

          // Create a new session
          const session = manager.createSession();

          // Verify the session uses the default model
          expect(session.currentModelId).toBe(defaultModel.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('SettingsManager - Unit Tests', () => {
  describe('Provider CRUD Operations', () => {
    it('should add a valid provider', () => {
      const manager = new SettingsManager();
      const result = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBeDefined();
      expect(result.provider!.name).toBe('OpenAI');
    });

    it('should reject provider with missing name', () => {
      const manager = new SettingsManager();
      const result = manager.addProvider({
        name: '',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Provider name is required');
    });

    it('should update an existing provider', () => {
      const manager = new SettingsManager();
      const addResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      const updateResult = manager.updateProvider(addResult.provider!.id, {
        name: 'OpenAI Updated',
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.provider!.name).toBe('OpenAI Updated');
    });

    it('should delete a provider and its models', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      manager.addModel({
        name: 'GPT-4',
        providerId: providerResult.provider!.id,
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      const deleted = manager.deleteProvider(providerResult.provider!.id);
      expect(deleted).toBe(true);
      expect(manager.getProviders()).toHaveLength(0);
      expect(manager.getModels()).toHaveLength(0);
    });

    it('should toggle provider enabled state', () => {
      const manager = new SettingsManager();
      const addResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      const toggleResult = manager.toggleProvider(addResult.provider!.id);
      expect(toggleResult.success).toBe(true);
      expect(toggleResult.enabled).toBe(false);

      const toggleResult2 = manager.toggleProvider(addResult.provider!.id);
      expect(toggleResult2.enabled).toBe(true);
    });
  });

  describe('Model CRUD Operations', () => {
    it('should add a valid model', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });
      const providerId = providerResult.provider!.id;

      const result = manager.addModel({
        name: 'GPT-4',
        providerId,
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      expect(result.success).toBe(true);
      expect(result.model).toBeDefined();
      expect(result.model!.name).toBe('GPT-4');
    });

    it('should reject model with missing name', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });
      const providerId = providerResult.provider!.id;

      const result = manager.addModel({
        name: '',
        providerId,
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Model name is required');
    });

    it('should reject model with non-existent provider', () => {
      const manager = new SettingsManager();
      const result = manager.addModel({
        name: 'GPT-4',
        providerId: 'non-existent-id',
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Provider not found');
    });

    it('should update an existing model', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });
      const providerId = providerResult.provider!.id;

      const addResult = manager.addModel({
        name: 'GPT-4',
        providerId,
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      const updateResult = manager.updateModel(addResult.model!.id, {
        name: 'GPT-4 Turbo',
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.model!.name).toBe('GPT-4 Turbo');
    });

    it('should delete a model', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });
      const providerId = providerResult.provider!.id;

      const addResult = manager.addModel({
        name: 'GPT-4',
        providerId,
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      const deleted = manager.deleteModel(addResult.model!.id);
      expect(deleted).toBe(true);
      expect(manager.getModels()).toHaveLength(0);
    });

    it('should set default model and unset others', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });
      const providerId = providerResult.provider!.id;

      const model1 = manager.addModel({
        name: 'GPT-4',
        providerId,
        modelIdentifier: 'gpt-4',
        isDefault: true,
      });

      const model2 = manager.addModel({
        name: 'GPT-3.5',
        providerId,
        modelIdentifier: 'gpt-3.5-turbo',
        isDefault: false,
      });

      // Set model2 as default
      manager.setDefaultModel(model2.model!.id);

      // Verify model2 is default and model1 is not
      const defaultModel = manager.getDefaultModel();
      expect(defaultModel!.id).toBe(model2.model!.id);

      const model1Updated = manager.getModel(model1.model!.id);
      expect(model1Updated!.isDefault).toBe(false);
    });
  });

  describe('Validation Logic', () => {
    it('should reject provider update with invalid data', () => {
      const manager = new SettingsManager();
      const addResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      const updateResult = manager.updateProvider(addResult.provider!.id, {
        name: '',
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.errors).toContain('Provider name is required');
    });

    it('should reject model update with invalid data', () => {
      const manager = new SettingsManager();
      const providerResult = manager.addProvider({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        enabled: true,
        type: 'openai',
      });

      const modelResult = manager.addModel({
        name: 'GPT-4',
        providerId: providerResult.provider!.id,
        modelIdentifier: 'gpt-4',
        isDefault: false,
      });

      const updateResult = manager.updateModel(modelResult.model!.id, {
        name: '',
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.errors).toContain('Model name is required');
    });

    it('should return false when deleting non-existent provider', () => {
      const manager = new SettingsManager();
      const deleted = manager.deleteProvider('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should return false when deleting non-existent model', () => {
      const manager = new SettingsManager();
      const deleted = manager.deleteModel('non-existent-id');
      expect(deleted).toBe(false);
    });
  });
});
