# AI Chat Sidebar

An integrated AI chat interface for Obsidian that allows you to interact with various AI models while leveraging your vault content as context.

## Features

- **Multiple AI Provider Support**: Configure OpenAI, Anthropic, or custom AI providers
- **Dynamic Model Switching**: Switch between different AI models mid-conversation
- **Context-Aware Conversations**: Include files, folders, or selected text as context
- **Persistent Chat History**: Your conversations are saved and restored across sessions
- **Streaming Responses**: See AI responses appear in real-time (when supported by provider)
- **Sidebar Integration**: Chat interface lives in Obsidian's sidebar for seamless workflow
- **Privacy-Focused**: All API requests go directly to your configured providers—no third-party tracking

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings → Community plugins**
2. Select **Browse** and search for "AI Chat Sidebar"
3. Select **Install**, then **Enable**

### Manual Installation

1. Download the latest release files (`main.js`, `manifest.json`, `styles.css`) from the [releases page](https://github.com/your-repo/releases)
2. Create a folder named `ai-chat-sidebar` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the `ai-chat-sidebar` folder
4. Reload Obsidian
5. Enable the plugin in **Settings → Community plugins**

## Configuration

### Setting Up AI Providers

1. Open **Settings → AI Chat Sidebar**
2. In the **Provider Management** section, select **Add Provider**
3. Configure your provider:
   - **Provider Name**: A friendly name (e.g., "OpenAI", "Anthropic")
   - **Provider Type**: Select OpenAI, Anthropic, or Custom
   - **Base URL**: The API endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your API key from the provider
   - **Enabled**: Toggle to enable/disable the provider

**Example OpenAI Configuration:**
- Provider Name: `OpenAI`
- Provider Type: `OpenAI`
- Base URL: `https://api.openai.com/v1`
- API Key: `sk-...` (your OpenAI API key)

**Example Anthropic Configuration:**
- Provider Name: `Anthropic`
- Provider Type: `Anthropic`
- Base URL: `https://api.anthropic.com`
- API Key: Your Anthropic API key

**Example Custom Provider:**
- Provider Name: `Local LLM`
- Provider Type: `Custom`
- Base URL: `http://localhost:11434/v1` (e.g., for Ollama)
- API Key: (leave empty if not required)

### Adding AI Models

1. In **Settings → AI Chat Sidebar**, go to the **Model Management** section
2. Select **Add Model**
3. Configure your model:
   - **Model Name**: Display name (e.g., "GPT-4", "Claude 3 Opus")
   - **Provider**: Select from your configured providers
   - **Model Identifier**: The API model ID (e.g., `gpt-4`, `claude-3-opus-20240229`)
   - **Set as Default**: Check to use this model for new chat sessions

**Example Models:**
- OpenAI GPT-4: `gpt-4`
- OpenAI GPT-3.5 Turbo: `gpt-3.5-turbo`
- Anthropic Claude 3 Opus: `claude-3-opus-20240229`
- Anthropic Claude 3 Sonnet: `claude-3-sonnet-20240229`

### General Settings

- **Max History Size**: Maximum number of messages to keep in history (default: 50)
- **Enable Streaming**: Show responses token-by-token as they arrive (default: enabled)

## Usage

### Opening the Chat Sidebar

Use any of these methods:
- Command palette: **Open AI Chat** (Ctrl/Cmd + P, then type "Open AI Chat")
- Ribbon icon: Click the chat icon in the left sidebar

### Sending Messages

1. Type your message in the input field at the bottom of the chat sidebar
2. Press **Enter** to send (or click the send button)
3. Press **Shift + Enter** to add a new line without sending

### Switching Models

1. Click the model selector dropdown at the top of the chat sidebar
2. Select a different model from the list
3. Your conversation history is preserved when switching models

### Adding Context

#### Adding Files
1. Click the **Add Context** button in the chat sidebar
2. Select **File** from the picker
3. Choose the file you want to include
4. The file content will be added to your conversation context

#### Adding Folders
1. Click the **Add Context** button
2. Select **Folder** from the picker
3. Choose a folder—all markdown files within will be included as context

#### Using Selected Text
1. Select text in any note
2. Open the command palette (Ctrl/Cmd + P)
3. Run **Chat with selection**
4. The chat sidebar opens with your selected text as context

#### Removing Context
- Click the **×** button on any context tag to remove it from the conversation

### Starting a New Session

1. Open the command palette (Ctrl/Cmd + P)
2. Run **New chat session**
3. Your previous conversation is saved and a fresh session begins

## Keyboard Shortcuts

- **Enter**: Send message
- **Shift + Enter**: New line in message input
- **Ctrl/Cmd + P** → "Open AI Chat": Open chat sidebar
- **Ctrl/Cmd + P** → "Chat with selection": Open chat with selected text
- **Ctrl/Cmd + P** → "New chat session": Start a new conversation

## Troubleshooting

### Plugin doesn't load after installation

- Ensure `main.js`, `manifest.json`, and `styles.css` are in `<Vault>/.obsidian/plugins/ai-chat-sidebar/`
- Reload Obsidian (**Settings → Community plugins → Reload**)
- Check that the plugin is enabled in **Settings → Community plugins**

### "Invalid API Key" error

- Verify your API key is correct in **Settings → AI Chat Sidebar → Provider Management**
- Ensure the provider is enabled
- Check that your API key has the necessary permissions with your provider

### No response from AI

- Check your internet connection
- Verify the provider's base URL is correct
- Ensure the model identifier matches your provider's API (e.g., `gpt-4`, not `GPT-4`)
- Check the Obsidian developer console (Ctrl/Cmd + Shift + I) for detailed error messages

### Rate limit errors

- Your provider may have rate limits on API requests
- Wait a few moments before sending another message
- Consider upgrading your API plan with the provider

### Context not being included

- Verify context items appear as tags in the chat interface
- Check that files exist and are readable
- For folders, ensure they contain markdown files
- Remove and re-add context items if needed

### Streaming not working

- Ensure **Enable Streaming** is checked in **Settings → AI Chat Sidebar**
- Some custom providers may not support streaming
- Check provider documentation for streaming support

### Chat history not persisting

- Ensure Obsidian has write permissions to your vault
- Check available disk space
- Try manually saving settings in **Settings → AI Chat Sidebar**

## Privacy and Security

### Data Privacy

- **No telemetry**: This plugin does not collect any usage data or analytics
- **Direct API calls**: All requests go directly from your device to your configured AI providers
- **Local storage**: Chat history and settings are stored locally in your vault
- **No third parties**: No data is sent to any third-party services beyond your configured providers

### API Key Security

- API keys are stored in Obsidian's encrypted data storage
- Keys are never logged or displayed in full (only last 4 characters shown in UI)
- Keys are transmitted only to your configured provider endpoints via HTTPS

### Content Privacy

- You control what content is sent to AI providers
- Only explicitly added context (files, folders, selections) is included in requests
- Your vault content is never accessed without your explicit action
- Consider your provider's data retention policies when sharing sensitive information

### Best Practices

- Use API keys with minimal necessary permissions
- Avoid including sensitive personal information in conversations
- Review your provider's privacy policy and terms of service
- For sensitive vaults, consider using local/self-hosted AI providers
- Regularly rotate API keys as a security precaution

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-repo/ai-chat-sidebar.git
cd ai-chat-sidebar

# Install dependencies
npm install

# Build for production
npm run build

# Or run in development mode with auto-rebuild
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Project Structure

```
src/
  commands/       # Command implementations
  context/        # Context management
  services/       # AI service client
  settings/       # Settings management
  state/          # Chat state management
  ui/             # UI components
  utils/          # Utility functions
  types.ts        # TypeScript interfaces
main.ts           # Plugin entry point
```

## Support

If you encounter issues or have feature requests:
- Check the [troubleshooting section](#troubleshooting) above
- Search [existing issues](https://github.com/your-repo/issues)
- Open a [new issue](https://github.com/your-repo/issues/new) with details

## License

[MIT License](LICENSE)

## Acknowledgments

Built with the [Obsidian API](https://github.com/obsidianmd/obsidian-api)
