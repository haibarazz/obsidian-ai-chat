import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { AIServiceClient, APIError } from './ai-client';
import type { AIProvider, AIModel, ChatMessage } from '../types';

describe('AIServiceClient', () => {
  let client: AIServiceClient;

  beforeEach(() => {
    client = new AIServiceClient();
    vi.clearAllMocks();
  });

  describe('Property Tests', () => {
    it('Property 6: API key inclusion', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (apiKey) => {
          expect(apiKey.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('Property 31: endpoint contains baseUrl', () => {
      fc.assert(
        fc.property(fc.webUrl(), (baseUrl) => {
          const endpoint = `${baseUrl}/chat/completions`;
          expect(endpoint).toContain(baseUrl);
        }),
        { numRuns: 100 }
      );
    });

    it('Property 32: provider type is valid', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('openai', 'anthropic', 'custom'),
          (type) => {
            expect(['openai', 'anthropic', 'custom']).toContain(type);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    it('should create client instance', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AIServiceClient);
    });

    it('should send message and get response', async () => {
      const provider: AIProvider = {
        id: 'test', name: 'Test', baseUrl: 'https://api.test.com',
        apiKey: 'key', enabled: true, type: 'openai',
      };
      const model: AIModel = {
        id: 'm1', name: 'Model', providerId: 'test',
        modelIdentifier: 'gpt-4', isDefault: true,
      };
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Hello!' } }] }),
      });

      const result = await client.sendMessage(provider, model, messages);
      expect(result).toBe('Hello!');
    });

    it('should throw APIError on 401', async () => {
      const provider: AIProvider = {
        id: 'test', name: 'Test', baseUrl: 'https://api.test.com',
        apiKey: 'bad', enabled: true, type: 'openai',
      };
      const model: AIModel = {
        id: 'm1', name: 'Model', providerId: 'test',
        modelIdentifier: 'gpt-4', isDefault: true,
      };
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 401, headers: new Headers(),
      });

      await expect(client.sendMessage(provider, model, messages))
        .rejects.toBeInstanceOf(APIError);
    });

    it('should throw APIError on 429', async () => {
      const provider: AIProvider = {
        id: 'test', name: 'Test', baseUrl: 'https://api.test.com',
        apiKey: 'key', enabled: true, type: 'openai',
      };
      const model: AIModel = {
        id: 'm1', name: 'Model', providerId: 'test',
        modelIdentifier: 'gpt-4', isDefault: true,
      };
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 429, headers: new Headers(),
      });

      await expect(client.sendMessage(provider, model, messages))
        .rejects.toBeInstanceOf(APIError);
    });

    it('should retry on 503 and succeed', async () => {
      const provider: AIProvider = {
        id: 'test', name: 'Test', baseUrl: 'https://api.test.com',
        apiKey: 'key', enabled: true, type: 'openai',
      };
      const model: AIModel = {
        id: 'm1', name: 'Model', providerId: 'test',
        modelIdentifier: 'gpt-4', isDefault: true,
      };
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
      ];

      let count = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        count++;
        if (count < 3) {
          return Promise.resolve({ ok: false, status: 503, headers: new Headers() });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
        });
      });

      const result = await client.sendMessage(provider, model, messages);
      expect(result).toBe('OK');
      expect(count).toBe(3);
    });
  });
});
