/**
 * Context management module
 * Contains the context manager for handling files, folders, and selections
 */

export {
  ContextManager,
  generateContextId,
  validateFilePath,
  isMarkdownFile,
  formatFileContext,
  formatSelectionContext,
  createObsidianAdapter,
  type FileSystemAdapter,
} from './context-manager';

export { LiveSelectionManager } from './live-selection';
