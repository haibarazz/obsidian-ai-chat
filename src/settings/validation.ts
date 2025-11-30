/**
 * Validation functions for provider and model configurations
 */

import type { AIProvider, AIModel, ProviderValidationResult, ModelValidationResult } from '../types';

/**
 * Validates a provider configuration
 * Returns validation result with any errors found
 * 
 * Requirements: 2.2 - WHEN the user adds a new provider THEN the Plugin SHALL require 
 * a provider name, base URL, and API key
 */
export function validateProvider(provider: Partial<AIProvider>): ProviderValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (!provider.name || provider.name.trim() === '') {
    errors.push('Provider name is required');
  }

  if (!provider.baseUrl || provider.baseUrl.trim() === '') {
    errors.push('Base URL is required');
  }

  if (!provider.apiKey || provider.apiKey.trim() === '') {
    errors.push('API key is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a model configuration
 * Returns validation result with any errors found
 * 
 * Requirements: 3.2 - WHEN the user adds a new model THEN the Plugin SHALL require 
 * a model name, provider association, and model identifier
 */
export function validateModel(model: Partial<AIModel>): ModelValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (!model.name || model.name.trim() === '') {
    errors.push('Model name is required');
  }

  if (!model.providerId || model.providerId.trim() === '') {
    errors.push('Provider ID is required');
  }

  if (!model.modelIdentifier || model.modelIdentifier.trim() === '') {
    errors.push('Model identifier is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
