/**
 * Property-based tests for validation functions
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateProvider, validateModel } from './validation';
import type { AIProvider, AIModel } from '../types';

/**
 * Custom arbitrary for generating valid AIProvider objects
 */
const arbitraryValidProvider = (): fc.Arbitrary<AIProvider> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    baseUrl: fc.webUrl(),
    apiKey: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    enabled: fc.boolean(),
    type: fc.constantFrom('openai', 'anthropic', 'custom') as fc.Arbitrary<'openai' | 'anthropic' | 'custom'>,
  });

/**
 * Custom arbitrary for generating valid AIModel objects
 */
const arbitraryValidModel = (): fc.Arbitrary<AIModel> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    providerId: fc.uuid(),
    modelIdentifier: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    isDefault: fc.boolean(),
  });

/**
 * Arbitrary for generating invalid provider configurations (missing required fields)
 */
const arbitraryInvalidProvider = (): fc.Arbitrary<Partial<AIProvider>> =>
  fc.oneof(
    // Missing name
    fc.record({
      id: fc.uuid(),
      name: fc.constantFrom('', '   ', undefined) as fc.Arbitrary<string | undefined>,
      baseUrl: fc.webUrl(),
      apiKey: fc.string({ minLength: 1 }),
      enabled: fc.boolean(),
      type: fc.constantFrom('openai', 'anthropic', 'custom') as fc.Arbitrary<'openai' | 'anthropic' | 'custom'>,
    }),
    // Missing baseUrl
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1 }),
      baseUrl: fc.constantFrom('', '   ', undefined) as fc.Arbitrary<string | undefined>,
      apiKey: fc.string({ minLength: 1 }),
      enabled: fc.boolean(),
      type: fc.constantFrom('openai', 'anthropic', 'custom') as fc.Arbitrary<'openai' | 'anthropic' | 'custom'>,
    }),
    // Missing apiKey
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1 }),
      baseUrl: fc.webUrl(),
      apiKey: fc.constantFrom('', '   ', undefined) as fc.Arbitrary<string | undefined>,
      enabled: fc.boolean(),
      type: fc.constantFrom('openai', 'anthropic', 'custom') as fc.Arbitrary<'openai' | 'anthropic' | 'custom'>,
    })
  );


/**
 * Arbitrary for generating invalid model configurations (missing required fields)
 */
const arbitraryInvalidModel = (): fc.Arbitrary<Partial<AIModel>> =>
  fc.oneof(
    // Missing name
    fc.record({
      id: fc.uuid(),
      name: fc.constantFrom('', '   ', undefined) as fc.Arbitrary<string | undefined>,
      providerId: fc.uuid(),
      modelIdentifier: fc.string({ minLength: 1 }),
      isDefault: fc.boolean(),
    }),
    // Missing providerId
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1 }),
      providerId: fc.constantFrom('', '   ', undefined) as fc.Arbitrary<string | undefined>,
      modelIdentifier: fc.string({ minLength: 1 }),
      isDefault: fc.boolean(),
    }),
    // Missing modelIdentifier
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1 }),
      providerId: fc.uuid(),
      modelIdentifier: fc.constantFrom('', '   ', undefined) as fc.Arbitrary<string | undefined>,
      isDefault: fc.boolean(),
    })
  );

describe('Provider Validation', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 3: Provider configuration validation**
   * 
   * *For any* provider creation attempt, the system should reject providers 
   * missing required fields (name, baseUrl, or apiKey).
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 3: should accept valid provider configurations', () => {
    fc.assert(
      fc.property(arbitraryValidProvider(), (provider) => {
        const result = validateProvider(provider);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: ai-chat-sidebar, Property 3: Provider configuration validation**
   * 
   * *For any* provider creation attempt, the system should reject providers 
   * missing required fields (name, baseUrl, or apiKey).
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 3: should reject provider configurations missing required fields', () => {
    fc.assert(
      fc.property(arbitraryInvalidProvider(), (provider) => {
        const result = validateProvider(provider);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Model Validation', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 7: Model configuration validation**
   * 
   * *For any* model creation attempt, the system should reject models 
   * missing required fields (name, providerId, or modelIdentifier).
   * 
   * **Validates: Requirements 3.2**
   */
  it('Property 7: should accept valid model configurations', () => {
    fc.assert(
      fc.property(arbitraryValidModel(), (model) => {
        const result = validateModel(model);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: ai-chat-sidebar, Property 7: Model configuration validation**
   * 
   * *For any* model creation attempt, the system should reject models 
   * missing required fields (name, providerId, or modelIdentifier).
   * 
   * **Validates: Requirements 3.2**
   */
  it('Property 7: should reject model configurations missing required fields', () => {
    fc.assert(
      fc.property(arbitraryInvalidModel(), (model) => {
        const result = validateModel(model);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
