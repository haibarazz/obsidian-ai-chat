/**
 * AI Service Client
 * 
 * Handles communication with AI provider APIs including:
 * - Request formatting for different providers (OpenAI, Anthropic, custom)
 * - Streaming and non-streaming responses
 * - Retry logic with exponential backoff
 * - Error classification and handling
 * - Timeout management
 */

import type { AIProvider, AIModel, ChatMessage, ContextItem } from '../types';

/**
 * Error types for API communication
 */
export type APIErrorType = 'auth' | 'rate_limit' | 'network' | 'server' | 'timeout' | 'unknown';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  type: APIErrorType;
  statusCode?: number;
  retryAfter?: number;

  constructor(message: string, type: APIErrorType, statusCode?: number, retryAfter?: number) {
    super(message);
    this.name = 'APIError';
    this.type = type;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

/**
 * Request body structure for OpenAI-compatible API
 */
interface OpenAIRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Request body structure for Anthropic API
 */
interface AnthropicRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  stream?: boolean;
  system?: string;
}


/**
 * AI Service Client for handling API communication
 */
export class AIServiceClient {
  private readonly MAX_RETRIES = 3;
  private readonly TIMEOUT_NON_STREAMING = 30000; // 30 seconds
  private readonly TIMEOUT_STREAMING = 60000; // 60 seconds
  private readonly BACKOFF_DELAYS = [1000, 2000, 4000]; // exponential backoff in ms

  /**
   * Send a non-streaming message to the AI provider
   */
  async sendMessage(
    provider: AIProvider,
    model: AIModel,
    messages: ChatMessage[],
    contextItems: ContextItem[] = []
  ): Promise<string> {
    const requestBody = this.formatRequest(provider, model, messages, contextItems, false);
    const response = await this.makeRequest(
      provider,
      requestBody,
      this.TIMEOUT_NON_STREAMING
    );
    return this.handleResponse(response);
  }

  /**
   * Send a streaming message to the AI provider
   */
  async sendMessageStream(
    provider: AIProvider,
    model: AIModel,
    messages: ChatMessage[],
    contextItems: ContextItem[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const requestBody = this.formatRequest(provider, model, messages, contextItems, true);
    const response = await this.makeRequest(
      provider,
      requestBody,
      this.TIMEOUT_STREAMING
    );
    await this.handleStreamResponse(response, onChunk);
  }

  /**
   * Format request body based on provider type
   */
  private formatRequest(
    provider: AIProvider,
    model: AIModel,
    messages: ChatMessage[],
    contextItems: ContextItem[],
    stream: boolean
  ): OpenAIRequest | AnthropicRequest {
    // Prepend context items as system/user messages
    const formattedMessages = this.prependContext(messages, contextItems);

    if (provider.type === 'openai') {
      return this.formatOpenAIRequest(model, formattedMessages, stream);
    } else if (provider.type === 'anthropic') {
      return this.formatAnthropicRequest(model, formattedMessages, stream);
    } else {
      // Custom provider - use OpenAI-compatible format by default
      return this.formatOpenAIRequest(model, formattedMessages, stream);
    }
  }

  /**
   * Format request for OpenAI-compatible API
   */
  private formatOpenAIRequest(
    model: AIModel,
    messages: ChatMessage[],
    stream: boolean
  ): OpenAIRequest {
    return {
      model: model.modelIdentifier,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      stream,
      temperature: 0.7,
      max_tokens: 2000,
    };
  }

  /**
   * Format request for Anthropic API
   */
  private formatAnthropicRequest(
    model: AIModel,
    messages: ChatMessage[],
    stream: boolean
  ): AnthropicRequest {
    // Separate system messages from other messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    return {
      model: model.modelIdentifier,
      messages: otherMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
      max_tokens: 2000,
      stream,
      system: systemMessages.length > 0 
        ? systemMessages.map(m => m.content).join('\n') 
        : undefined,
    };
  }

  /**
   * Prepend context items to messages as system messages
   */
  private prependContext(
    messages: ChatMessage[],
    contextItems: ContextItem[]
  ): ChatMessage[] {
    if (contextItems.length === 0) {
      return messages;
    }

    // Create context message
    const contextContent = contextItems
      .map(item => `[${item.displayName}]\n${item.content}`)
      .join('\n\n---\n\n');

    const contextMessage: ChatMessage = {
      id: 'context-' + Date.now(),
      role: 'system',
      content: `Context:\n\n${contextContent}`,
      timestamp: Date.now(),
    };

    return [contextMessage, ...messages];
  }


  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(
    provider: AIProvider,
    requestBody: OpenAIRequest | AnthropicRequest,
    timeout: number
  ): Promise<Response> {
    let lastError: APIError | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Check for errors
          if (!response.ok) {
            const error = this.classifyError(response);
            lastError = error;

            // Don't retry auth errors
            if (error.type === 'auth') {
              throw error;
            }

            // Don't retry rate limit errors
            if (error.type === 'rate_limit') {
              throw error;
            }

            // Don't retry if this is the last attempt
            if (attempt === this.MAX_RETRIES - 1) {
              throw error;
            }

            // Wait before retrying
            await this.delay(this.BACKOFF_DELAYS[attempt]);
            continue;
          }

          return response;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        if (error instanceof APIError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new APIError(
            'Request timeout. Please try again.',
            'timeout'
          );
        } else {
          lastError = new APIError(
            'Network error. Please check your connection and try again.',
            'network'
          );
        }

        // Don't retry if this is the last attempt
        if (attempt === this.MAX_RETRIES - 1) {
          throw lastError;
        }

        // Wait before retrying
        await this.delay(this.BACKOFF_DELAYS[attempt]);
      }
    }

    throw lastError || new APIError('Unknown error', 'unknown');
  }

  /**
   * Handle non-streaming response
   */
  private async handleResponse(response: Response): Promise<string> {
    const data = await response.json();

    // OpenAI format
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    // Anthropic format
    if (data.content && data.content[0]?.text) {
      return data.content[0].text;
    }

    throw new APIError('Unexpected API response format', 'unknown');
  }

  /**
   * Handle streaming response
   */
  private async handleStreamResponse(
    response: Response,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new APIError('Response body is not readable', 'unknown');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = this.extractStreamContent(parsed);
              if (content) {
                onChunk(content);
              }
            } catch {
              // Skip malformed JSON lines
              continue;
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim().startsWith('data: ')) {
        const data = buffer.trim().slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = this.extractStreamContent(parsed);
            if (content) {
              onChunk(content);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }


  /**
   * Extract content from streaming response chunk
   */
  private extractStreamContent(parsed: Record<string, unknown>): string {
    // OpenAI format
    const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined;
    if (choices?.[0]?.delta?.content) {
      return choices[0].delta.content;
    }

    // Anthropic format
    const delta = parsed.delta as { text?: string } | undefined;
    if (delta?.text) {
      return delta.text;
    }

    return '';
  }

  /**
   * Classify API error based on response
   */
  private classifyError(response: Response): APIError {
    const statusCode = response.status;

    if (statusCode === 401 || statusCode === 403) {
      return new APIError(
        'Invalid API key. Please check your provider settings.',
        'auth',
        statusCode
      );
    }

    if (statusCode === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      return new APIError(
        'Rate limit exceeded. Please wait before sending another message.',
        'rate_limit',
        statusCode,
        retryAfter
      );
    }

    if (statusCode >= 500) {
      return new APIError(
        'AI provider service error. Please try again later.',
        'server',
        statusCode
      );
    }

    return new APIError(`API error: ${statusCode}`, 'unknown', statusCode);
  }

  /**
   * Delay helper for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
