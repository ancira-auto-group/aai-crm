# AAI for CRM Chrome Extension

A production-ready Chrome extension that enhances text on VinSolutions CRM pages using OpenAI's GPT-6 Luna model. Select any text, click the enhancement button, and get AI-powered suggestions to improve clarity, professionalism, and impact.

## Features

- **Smart Text Selection**: Automatically detects text selections (10+ characters) and displays a floating action button
- **AI-Powered Enhancement**: Uses OpenAI's GPT-6 Luna (default) or GPT-6 Sol, selectable in settings
- **Streaming Responses**: Suggestions appear word-by-word as they're generated
- **Usage Tracking**: Monthly token counts and estimated cost on the settings page
- **Professional UI**: Clean, modern interface with smooth animations and intuitive controls
- **Flexible Regeneration**: "Mix It Up" to regenerate or "Add Some Flair" for custom instructions
- **Daily Prompt Updates**: Automatically refreshes system prompt from a GitHub Gist every day at 00:01
- **Secure Key Storage**: API key kept in memory for the browser session by default (optionally remembered), and never readable by CRM pages
- **Error Handling**: Comprehensive error handling with user-friendly messages and retry options

## Installation

### 1. Clone or Download the Extension

```bash
git clone <repository-url>
cd chrome-extension
```

### 2. Create Extension Icons

You'll need to create three icon sizes (16x16, 48x48, 128x128). Place them in the `icons/` directory:

- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`

**Quick Icon Creation Options:**
- Use an online icon generator (search "chrome extension icon generator")
- Use design tools like Figma, Canva, or Adobe Express
- Use AI image generators with prompt: "professional chrome extension icon with purple gradient, sparkles or magic wand theme"

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. The extension should now appear in your extensions list

## Configuration

### 1. Get an OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)
5. **Important**: Add credits to your OpenAI account for API usage

### 2. Configure the Extension

1. Click the extension icon in Chrome toolbar
2. Click "Open Settings"
3. Paste your OpenAI API key in the "API Key" field
4. Click "Save API Key"
5. Click "Test Connection" to verify it works

### 3. System Prompt (Pre-configured)

**The system prompt URL is already configured and ready to use!** The extension will automatically fetch the latest prompt on installation and refresh it daily at 00:01.

#### How It Works

- **Pre-configured URL**: The extension comes with a GitHub Gist URL already set
- **Automatic Updates**: Fetches the latest prompt daily at 00:01 local time
- **Manual Refresh**: You can click "Check for Updated Prompt" in settings anytime

#### To Update the System Prompt

Since the prompt is hosted on GitHub Gist, you can update it anytime by editing the gist. Changes will be automatically picked up during the next daily refresh (or manual refresh).

#### To Use a Different Prompt URL (Optional)

If you want to use your own custom system prompt:

1. Create a GitHub Gist with your custom prompt text
2. Get the raw URL (click "Raw" button in gist)
3. Open extension settings
4. Paste your URL in the "Prompt URL" field
5. Click "Save URL"
6. Click "Check for Updated Prompt" to fetch it immediately

## Default System Prompt

The extension includes a default system prompt focused on professional CRM communications:

```
You are a professional text enhancement assistant for automotive CRM communications.
Your goal is to improve clarity, professionalism, and impact while preserving all
key information.

Guidelines:
- Maintain the original meaning and key details
- Enhance clarity and readability
- Use professional but friendly tone appropriate for automotive industry
- Fix grammar and spelling errors
- Improve sentence structure and flow
- Keep the response concise and natural
- Do not add information that wasn't in the original text
```

### Customizing Your System Prompt

Create a GitHub Gist with your custom prompt. Consider including:

- **Tone guidelines**: Formal, casual, friendly, etc.
- **Industry-specific terminology**: Your company's preferred language
- **Length preferences**: Concise vs. detailed
- **Formatting rules**: Bullet points, paragraphs, etc.
- **Specific instructions**: What to emphasize or avoid

**Example Custom Prompt:**

```
You are an AI text enhancement assistant for [Your Company] automotive CRM.

Enhance text to be:
- Professional yet warm and personable
- Clear and concise (under 200 words when possible)
- Customer-focused with emphasis on benefits
- Free of jargon unless industry-standard

Always:
- Preserve specific details (names, dates, prices, model names)
- Fix grammar and spelling
- Improve readability
- Use active voice

Never:
- Add information not in the original
- Change the core message
- Use overly formal or stiff language
```

## Usage

### On VinSolutions CRM Pages

1. Navigate to any page on:
   - `*.vinsolutions.com`
   - `*.vinsolutions.app.coxautoinc.com`

2. Select any text (minimum 10 characters)

3. Click the purple floating button that appears

4. Review the enhanced text in the modal

5. Use the action buttons:
   - **Copy & Close**: Copies enhanced text to clipboard and closes modal
   - **Mix It Up**: Regenerates with the same prompt for variety
   - **Add Some Flair**: Opens a field to add custom instructions, then regenerates

### Testing Before VinSolutions

The extension works on any webpage, so you can test it on public sites like:
- [Wikipedia](https://en.wikipedia.org)
- [Example.com](https://example.com)
- Any blog or news article

**Note**: The extension is restricted by `content_scripts` matches in `manifest.json`. To test on other domains, temporarily add them to the `matches` array:

```json
"matches": [
  "*://*.vinsolutions.com/*",
  "*://*.vinsolutions.app.coxautoinc.com/*",
  "*://*/*"  // Add this line for testing on all sites (remove in production)
]
```

## File Structure

```
chrome-extension/
├── manifest.json           # Extension configuration (Manifest V3)
├── background.js           # Service worker (API calls, prompt refresh)
├── content.js             # Content script (text selection, UI)
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── options.html           # Settings page UI
├── options.js             # Settings page logic
├── styles/
│   └── content.css        # Styles for injected UI
├── icons/
│   ├── icon16.png         # Extension icon 16x16
│   ├── icon48.png         # Extension icon 48x48
│   └── icon128.png        # Extension icon 128x128
└── README.md              # This file
```

## API Usage and Costs

### Models

Choose the model in **Settings → AI Model**:

| Model | Input / Output (per 1M tokens) | Notes |
|---|---|---|
| `gpt-6-luna` (default) | $0.10 / $0.50 | Fast, cheapest; ideal for rewriting and short replies |
| `gpt-6-sol` | $2.00 / $10.00 | Higher quality, ~20x the cost |

Requests use the Chat Completions API with streaming, `reasoning_effort: "none"` (no hidden reasoning tokens, fastest replies), `temperature: 0.7` and `max_completion_tokens: 800`.

### Estimated Costs (GPT-6 Luna)

- **Cost**: ~$0.0001 per request (typical text lengths)
- **Light usage** (10 requests/day): ~$0.04/month
- **Moderate usage** (50 requests/day): ~$0.19/month
- **Heavy usage** (200 requests/day): ~$0.75/month

*Costs are estimates and vary with input/output length. The settings page shows actual token usage and estimated cost per month for this browser.*

## Troubleshooting

### Extension Not Working

1. **Check Developer Mode**: Ensure it's enabled in `chrome://extensions/`
2. **Reload Extension**: Click the reload icon on the extension card
3. **Check Console**: Right-click extension → Inspect → Console for errors
4. **Verify Icons**: Ensure all three icon files exist in the `icons/` folder

### API Key Issues

1. **Key disappears after restarting Chrome**: That's the default for security. Tick "Remember my API key" in settings to keep it
2. **Invalid Key Error**: Make sure key starts with `sk-`
3. **401 Unauthorized**: Check that your OpenAI account is active
4. **Model not available**: Your key's project doesn't have access to the selected model; pick another in settings or enable it in the OpenAI dashboard
5. **429 Rate Limit**: You've exceeded your API quota; check [OpenAI usage](https://platform.openai.com/usage)
6. **Insufficient Credits**: Add credits to your OpenAI account

### Text Not Enhancing

1. **Selection Too Short**: Must be at least 10 characters
2. **Wrong Domain**: Check you're on a VinSolutions domain
3. **API Key Missing**: Configure in settings
4. **Network Error**: Check internet connection

### Prompt Not Updating

1. **Invalid URL**: Ensure it's a raw GitHub Gist URL
2. **Private Gist**: Make sure gist is public or use secret URL
3. **Network Error**: Check internet connection
4. **Check Logs**: Open background console: `chrome://extensions/` → Details → Inspect views: service worker

## Development

### Debug Content Script

1. Right-click on the page → Inspect
2. Console tab will show content script logs
3. Look for messages starting with "AAI CRM Extension:"

### Debug Background Service Worker

1. Go to `chrome://extensions/`
2. Find the extension
3. Click "Inspect views: service worker"
4. Console will show background script logs

### Modify and Reload

1. Make changes to files
2. Go to `chrome://extensions/`
3. Click reload icon on extension card
4. Refresh any open pages where content script runs

## Security & Privacy

- **API keys** stored in `chrome.storage.session` (memory only, cleared when the browser closes) unless you choose to remember it, in which case `chrome.storage.local` is used. Content scripts never read the key; only the background worker does, and it's only sent to OpenAI
- **Use a spend-limited key**: create a dedicated OpenAI project key with a monthly budget for this extension
- **No tracking or analytics** - this extension sends no data anywhere except OpenAI API
- **No external dependencies** - pure JavaScript, no third-party libraries
- **Scoped permissions** - only runs on specified VinSolutions domains

## Browser Compatibility

- **Chrome**: Version 88+ (Manifest V3 support)
- **Edge**: Version 88+ (Chromium-based)
- **Brave**: Version 1.20+
- **Opera**: Version 74+

*Not compatible with Firefox (uses different extension format)*

## Support

For issues, questions, or feature requests:

1. Check this README first
2. Review browser console for error messages
3. Verify OpenAI API key is valid and has credits
4. Test on example.com to isolate domain-specific issues

## License

This extension is provided as-is for use with VinSolutions CRM. Modify and distribute according to your organization's policies.

## Changelog

### Version 2.1.0

- Switched to GPT-6 Luna (default) with GPT-6 Sol selectable in settings
- Fixed API parameters for GPT-6 (`max_completion_tokens`, `reasoning_effort: "none"`)
- Streaming responses in the modal; closing the modal cancels the request
- API key kept in session storage by default, with an opt-in "remember" setting
- Monthly usage and estimated cost on the settings page
- "Test Connection" now checks access to the selected model without spending tokens

### Version 1.0.0 (2024)

- Initial release
- Text selection detection and floating button
- OpenAI GPT-4o-mini integration
- Modal UI with regeneration options
- Settings page with API key management
- Daily system prompt refresh
- Comprehensive error handling

---

**Built with ❤️ for automotive professionals**
