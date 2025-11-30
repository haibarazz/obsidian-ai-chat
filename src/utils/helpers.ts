/**
 * Utility functions and helpers for the AI Chat Sidebar plugin
 * Provides common functionality used across the plugin
 * 
 * Requirements: 2.2, 3.2, 7.1, 8.1
 */

/**
 * Generates a unique ID using timestamp and random string
 * Used for providers, models, sessions, messages, and context items
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Formats a timestamp into a human-readable string
 * Requirements: 8.1 - Messages displayed with timestamps
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param includeDate - Whether to include the date (default: false for same-day)
 * @returns Formatted time string (e.g., "2:30 PM" or "Nov 30, 2:30 PM")
 */
export function formatTimestamp(timestamp: number, includeDate = false): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  
  // Check if same day
  const isSameDay = 
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  
  if (includeDate || !isSameDay) {
    const dateOptions: Intl.DateTimeFormatOptions = {
      ...timeOptions,
      month: 'short',
      day: 'numeric',
    };
    
    // Include year if different
    if (date.getFullYear() !== now.getFullYear()) {
      dateOptions.year = 'numeric';
    }
    
    return date.toLocaleString(undefined, dateOptions);
  }
  
  return date.toLocaleTimeString(undefined, timeOptions);
}

/**
 * Sanitizes content for safe HTML display by escaping special characters
 * Prevents XSS attacks when rendering user content
 * 
 * @param content - Raw content string
 * @returns HTML-escaped string safe for rendering
 */
export function sanitizeHtml(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };
  
  return content.replace(/[&<>"'`=/]/g, char => escapeMap[char]);
}

/**
 * Validates a URL format
 * Requirements: 2.2 - Provider requires base URL validation
 * 
 * @param url - URL string to validate
 * @returns true if URL is valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}


/**
 * Sanitizes a file path to prevent directory traversal attacks
 * Requirements: Security - Sanitize file paths to prevent directory traversal
 * 
 * @param path - File path to sanitize
 * @returns Sanitized path or null if path is invalid/dangerous
 */
export function sanitizeFilePath(path: string): string | null {
  if (!path || typeof path !== 'string') {
    return null;
  }
  
  // Normalize path separators to forward slashes
  let normalized = path.replace(/\\/g, '/');
  
  // Remove leading/trailing whitespace
  normalized = normalized.trim();
  
  // Check for directory traversal attempts
  if (normalized.includes('..')) {
    return null;
  }
  
  // Check for absolute paths (Unix or Windows style)
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }
  
  // Remove any null bytes (security)
  normalized = normalized.replace(/\0/g, '');
  
  // Remove leading slashes after normalization
  normalized = normalized.replace(/^\/+/, '');
  
  // Collapse multiple slashes
  normalized = normalized.replace(/\/+/g, '/');
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  return normalized || null;
}

/**
 * Validates a file path for security (prevents directory traversal)
 * 
 * @param path - File path to validate
 * @returns true if path is safe, false otherwise
 */
export function isValidFilePath(path: string): boolean {
  return sanitizeFilePath(path) !== null;
}

/**
 * Formats an error message for user display
 * Provides consistent error message formatting across the plugin
 * 
 * @param error - Error object or string
 * @param context - Optional context about where the error occurred
 * @returns Formatted error message string
 */
export function formatErrorMessage(error: unknown, context?: string): string {
  let message: string;
  
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'An unknown error occurred';
  }
  
  if (context) {
    return `${context}: ${message}`;
  }
  
  return message;
}

/**
 * Formats API error messages based on status codes
 * Provides user-friendly error messages for common API errors
 * 
 * @param statusCode - HTTP status code
 * @param defaultMessage - Default message if status code is not recognized
 * @returns User-friendly error message
 */
export function formatApiError(statusCode: number, defaultMessage?: string): string {
  const errorMessages: Record<number, string> = {
    400: 'Invalid request. Please check your input and try again.',
    401: 'Authentication failed. Please check your API key in settings.',
    403: 'Access denied. Your API key may not have permission for this operation.',
    404: 'The requested resource was not found. Please check your provider configuration.',
    429: 'Rate limit exceeded. Please wait a moment before trying again.',
    500: 'The AI service encountered an internal error. Please try again later.',
    502: 'The AI service is temporarily unavailable. Please try again later.',
    503: 'The AI service is currently overloaded. Please try again later.',
    504: 'The request timed out. Please try again.',
  };
  
  return errorMessages[statusCode] || defaultMessage || `Request failed with status ${statusCode}`;
}

/**
 * Truncates a string to a maximum length with ellipsis
 * 
 * @param str - String to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated string with ellipsis if needed
 */
export function truncateString(str: string, maxLength = 100): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  
  if (str.length <= maxLength) {
    return str;
  }
  
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Debounces a function call
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Checks if a string is empty or contains only whitespace
 * 
 * @param str - String to check
 * @returns true if string is empty or whitespace-only
 */
export function isEmptyOrWhitespace(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}
