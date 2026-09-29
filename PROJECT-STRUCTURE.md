# AAI CRM Extension - Project Structure

Complete file listing and descriptions for the Chrome extension.

## Core Extension Files

### manifest.json
**Purpose**: Chrome extension configuration (Manifest V3)
**Contains**: Permissions, content scripts, background worker, icons, metadata
**Must Edit**: Only if adding new domains or changing permissions

### background.js
**Purpose**: Service worker for API calls and background tasks
**Contains**: OpenAI API integration, system prompt refresh, daily alarms
**Key Functions**:
- `onConnect` listener - Streams enhance/response generations to the content script over a port
- `buildMessages()` - Build chat messages for enhance or response mode
- `streamOpenAI()` - Streaming Chat Completions call
- `recordUsage()` - Track monthly token usage and estimated cost
- `fetchEnhancePrompt()` / `fetchResponsePrompt()` - Retrieve and cache system prompts
- `testApiKey()` - Validate API key and model access

### models.js
**Purpose**: Shared model catalog (IDs, labels, prices)
**Used by**: background.js (`importScripts`) and options.html

### content.js
**Purpose**: Content script injected into VinSolutions pages
**Contains**: Text selection detection, floating button, modal UI
**Key Functions**:
- `checkSelection()` - Detect valid text selections
- `showFloatingButton()` - Display enhancement button
- `createModal()` - Generate and show modal UI
- `generateEnhancedText()` - Stream enhancement/response from background into the modal (each result is a version)
- `resolveInsertTarget()` / `insertIntoTarget()` - Decide where the result goes and insert it
- `insertAndClose()` - Insert into the CRM, copy to clipboard, close modal
- `handleModalKeydown()` - Esc / Ctrl+Enter / focus trap

### styles/content.css
**Purpose**: Styles for injected UI elements
**Contains**: Floating button, modal, loading states, animations
**Customizable**: Colors, sizes, positioning, animations

## User Interface Files

### popup.html
**Purpose**: Extension icon popup (quick access)
**Contains**: Status check, settings link, test page link
**Shows**: Configuration status, quick actions

### popup.js
**Purpose**: Logic for popup UI
**Contains**: Configuration check, button handlers

### options.html
**Purpose**: Full settings/configuration page
**Contains**: API key input, prompt URL config, test buttons
**Features**: API key management, connection testing, prompt refresh

### options.js
**Purpose**: Logic for settings page
**Contains**: Form handling, API key storage, prompt management
**Key Functions**:
- `saveApiKey()` - Store API key securely
- `testConnection()` - Validate API key with OpenAI
- `refreshPrompt()` - Manually fetch system prompt
- `savePromptUrl()` - Store GitHub Gist URL

## Documentation Files

### README.md
**Purpose**: Main documentation and user guide
**Contains**: Full installation, configuration, usage instructions
**Sections**: Features, setup, configuration, troubleshooting, API costs

### QUICKSTART.md
**Purpose**: Fast-track setup guide (5 minutes)
**Contains**: Condensed installation and configuration steps
**Target**: Users who want to get running quickly

### ADVANCED-CONFIGURATION.md
**Purpose**: Advanced customization guide
**Contains**: System prompt templates, API tuning, domain config
**Target**: Power users, developers, customization needs

### PROJECT-STRUCTURE.md
**Purpose**: This file - project overview
**Contains**: File listing and descriptions

### ICONS-README.txt
**Purpose**: Icon requirements and creation guide
**Contains**: Required sizes, design specs, creation methods

## Sample/Template Files

### sample-system-prompt.txt
**Purpose**: Template system prompt for GitHub Gist
**Contains**: Default prompt with guidelines for text enhancement
**Usage**: Copy to GitHub Gist, customize as needed

### test-page.html
**Purpose**: Test page for extension development
**Contains**: Sample texts, instructions, troubleshooting
**Usage**: Open in browser to test without VinSolutions access

## Configuration Files

### .gitignore
**Purpose**: Exclude files from version control
**Contains**: Extension artifacts, OS files, IDE files

## Required But Not Included

### icons/ Directory
**Status**: Must be created by user
**Required Files**:
- `icons/icon16.png` (16x16px)
- `icons/icon48.png` (48x48px)
- `icons/icon128.png` (128x128px)

**See**: ICONS-README.txt for creation instructions

## File Dependencies

```
manifest.json
├── background.js (service worker)
├── content.js (content script)
│   └── styles/content.css
├── popup.html
│   └── popup.js
├── options.html
│   └── options.js
└── icons/*.png

External Dependencies:
├── OpenAI API (https://api.openai.com)
└── GitHub Gist (for system prompt - optional)
```

## File Size Summary

| File | Lines | Purpose |
|------|-------|---------|
| background.js | ~300 | Service worker & API |
| content.js | ~350 | UI & interactions |
| content.css | ~300 | Styling |
| options.js | ~250 | Settings logic |
| options.html | ~150 | Settings UI |
| popup.js | ~30 | Popup logic |
| popup.html | ~80 | Popup UI |
| **Total Code** | **~1,460** | **All JavaScript/CSS/HTML** |

## Security Considerations

### Sensitive Data
- **API Key**: Stored in `chrome.storage.session` by default (memory only), or `chrome.storage.local` if the user opts to remember it; never synced, never read by content scripts
- **System Prompt**: Cached locally, fetched from public URL
- **User Text**: Sent only to OpenAI API, not logged

### Permissions Used
- `storage` - Store API key and preferences
- `alarms` - Schedule daily prompt refresh
- `host_permissions` - OpenAI API access only

### Content Script Access
- Limited to VinSolutions domains (configurable)
- No access to sensitive Chrome APIs
- Isolated from page JavaScript

## Development Workflow

### Initial Setup
1. Create icons (see ICONS-README.txt)
2. Load extension in Chrome
3. Configure API key
4. Test on test-page.html

### Making Changes
1. Edit relevant file(s)
2. Go to chrome://extensions/
3. Click reload icon on extension
4. Refresh any open pages
5. Test changes

### Debugging
- **Content Script**: Page console (F12)
- **Background Worker**: Extensions page → Inspect views
- **Popup**: Right-click popup → Inspect
- **Options**: Right-click options page → Inspect

## Deployment Checklist

- [ ] Icons created and in place
- [ ] Manifest.json domains configured
- [ ] Test-only domains removed
- [ ] API key configured
- [ ] System prompt URL set (optional)
- [ ] Tested on actual VinSolutions pages
- [ ] Error handling verified
- [ ] Documentation reviewed

## Version Control

### Recommended Git Structure
```
repo/
├── chrome-extension/       (this directory)
│   ├── manifest.json
│   ├── *.js, *.html, *.css
│   └── docs/
└── README.md              (repo readme)
```

### What to Commit
- All source files (.js, .html, .css, .json)
- Documentation (.md, .txt)
- .gitignore

### What NOT to Commit
- API keys (obviously)
- icons/*.png (unless you want to share)
- Test files with real data
- Extension packages (.crx, .zip)

## Support Resources

- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/
- **OpenAI API Docs**: https://platform.openai.com/docs/
- **Manifest V3 Guide**: https://developer.chrome.com/docs/extensions/mv3/intro/

## Future Enhancements

Potential features to add:
- [ ] Multiple system prompt profiles
- [ ] Usage statistics dashboard
- [ ] Text enhancement history
- [ ] Keyboard shortcuts
- [ ] Batch processing
- [ ] Custom templates
- [ ] Diff view (before/after)
- [ ] Export/import settings

---

**Project Status**: Production Ready ✅
**Version**: 1.0.0
**Last Updated**: 2024
