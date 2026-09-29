# Quick Start Guide

Get the AAI CRM Extension running in 5 minutes!

## Prerequisites

- Google Chrome browser
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
- Extension icon files (see ICONS-README.txt)

## Step 1: Prepare Icons (2 minutes)

1. Create or download three PNG icon files:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

2. Place them in the `icons/` folder

**Quick option**: Use any three PNG files as placeholders for testing, just rename them.

## Step 2: Load Extension (1 minute)

1. Open Chrome and go to: `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder
5. Extension should appear in your extensions list

## Step 3: Configure API Key (2 minutes)

1. Click the extension icon in Chrome toolbar (purple puzzle piece area)
2. Click **Open Settings**
3. Paste your OpenAI API key in the "API Key" field
4. Click **Save API Key**
5. Click **Test Connection** to verify

**✓ You're ready to go!**

## First Test

1. Go to any webpage (try [Example.com](https://example.com) or [Wikipedia](https://wikipedia.org))
   - **Note**: For VinSolutions domains only, update `manifest.json` matches to include test domains temporarily
2. Select some text (at least 10 characters)
3. Click the purple floating button that appears
4. See your enhanced text!

## System Prompt (Already Configured!)

**Good news!** The system prompt is already configured with a GitHub Gist URL. The extension will:

- Automatically fetch the prompt on first install
- Refresh it daily at 00:01 local time
- Use the latest version from the gist

**To update the prompt:** Simply edit the GitHub Gist content. Changes will be picked up automatically during the next daily refresh, or click "Check for Updated Prompt" in settings for immediate update.

**To use your own prompt:** Create your own GitHub Gist, get the raw URL, and update it in extension settings → "Prompt URL" field.

## Troubleshooting

### Extension won't load
- **Solution**: Check that all three icon files exist in `icons/` folder

### Can't test on VinSolutions
- **Solution**: Test on public websites first (Wikipedia, Example.com)
- **For testing on all sites**: Add `"*://*/*"` to `matches` array in `manifest.json`

### API errors
- **401 Unauthorized**: Check API key is correct and active
- **429 Rate limit**: Add credits to OpenAI account
- **No API key**: Configure in settings first

### Button doesn't appear
- **Select more text**: Minimum 10 characters required
- **Check domain**: Must be on allowed domain (see manifest.json)
- **Reload page**: After loading extension, refresh the page

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Customize your system prompt for your team's needs
- Share the extension with your team
- Monitor your OpenAI API usage at [platform.openai.com/usage](https://platform.openai.com/usage)

## Support

Having issues? Check:
1. Browser console (F12) for JavaScript errors
2. Extension service worker console (`chrome://extensions/` → Inspect views)
3. OpenAI API status page
4. This README and main documentation

---

**Happy enhancing! 🚀**
