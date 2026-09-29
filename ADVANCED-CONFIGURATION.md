# Advanced Configuration Guide

This guide covers advanced customization options for the AAI CRM Extension.

## System Prompt Customization

### Understanding the System Prompt

The system prompt is the instruction set that tells the AI how to enhance your text. It defines:

- **Tone**: Formal, casual, friendly, professional, etc.
- **Style**: Concise, detailed, bullet points, paragraphs, etc.
- **Rules**: What to preserve, what to change, what to avoid
- **Context**: Industry, audience, purpose

### Best Practices for Writing System Prompts

1. **Be Specific**: Vague instructions lead to inconsistent results
2. **Give Examples**: Show the AI what you want (optional but helpful)
3. **Set Boundaries**: Clearly state what NOT to do
4. **Consider Length**: Longer prompts = more tokens = higher cost, but more control
5. **Test Iteratively**: Try different versions and see what works best

### Advanced System Prompt Template

```
You are an AI text enhancement assistant for [COMPANY NAME] [INDUSTRY] CRM.

CORE OBJECTIVE:
[Your primary goal - e.g., "Improve customer communication clarity and professionalism"]

TONE & STYLE:
- [Tone descriptor]: Professional, warm, friendly, formal, casual, etc.
- [Length preference]: Concise (under 150 words), moderate, detailed
- [Voice preference]: Active voice, conversational, authoritative
- [Formatting]: Paragraphs, bullet points, numbered lists

ALWAYS PRESERVE:
- Customer names and contact information
- Dates and times
- Prices and financial figures
- Vehicle makes, models, and specifications
- Appointment details
- Technical specifications
- Legal disclaimers

ALWAYS IMPROVE:
- Grammar and spelling errors
- Sentence structure and clarity
- Punctuation and formatting
- Readability and flow
- Professional language

NEVER:
- Add information not in the original text
- Change the core message or intent
- Remove important details
- Use overly formal or stiff language
- Include marketing jargon unless in original
- [Your specific restrictions]

INDUSTRY-SPECIFIC GUIDANCE:
- [Industry terms to use or avoid]
- [Common scenarios and how to handle them]
- [Brand voice guidelines]

SPECIAL INSTRUCTIONS:
- [Any additional rules specific to your use case]

When enhancing, return ONLY the enhanced text without explanations.
```

### Example: Automotive Dealership

```
You are an AI text enhancement assistant for Premier Auto Group's CRM communications.

CORE OBJECTIVE:
Enhance customer communications to be clear, professional, and customer-focused while maintaining our friendly, no-pressure sales approach.

TONE & STYLE:
- Professional yet warm and approachable
- Conversational without being too casual
- Customer-focused with emphasis on benefits
- Concise - aim for under 200 words when possible
- Use active voice and positive language

ALWAYS PRESERVE:
- Customer names (with correct spelling)
- Vehicle details (year, make, model, trim, VIN)
- Prices, payments, interest rates, and financial terms
- Dates, times, and appointment details
- Specific promises or commitments made
- Service recommendations and technical details

ALWAYS IMPROVE:
- Fix all grammar, spelling, and punctuation errors
- Improve sentence structure and flow
- Remove filler words and redundancy
- Use clear, direct language
- Ensure professional greeting and closing
- Add proper paragraph breaks for readability

NEVER:
- Add information not stated in the original text
- Change pricing or financial details
- Modify dates, times, or appointments
- Remove important disclaimers or legal language
- Use high-pressure sales tactics
- Include generic marketing speak
- Over-promise or exaggerate

INDUSTRY-SPECIFIC GUIDANCE:
- Use "pre-owned" not "used" for vehicles
- Reference specific features by benefit (e.g., "lane-keeping assist for safer highway driving")
- Include relevant certifications (e.g., "Honda Certified Pre-Owned")
- Mention warranties when applicable
- Use exact trim level names (e.g., "EX-L" not "top trim")

SPECIAL INSTRUCTIONS:
- If text mentions test drive, ensure time/date is clear
- For service reminders, maintain urgency without being pushy
- For follow-ups, keep friendly tone that doesn't pressure
- For pricing discussions, ensure all numbers are exact
- Include clear next steps or call-to-action when appropriate

Return only the enhanced text without explanations or meta-commentary.
```

## Modifying OpenAI API Parameters

You can adjust AI behavior by modifying `background.js`:

### Temperature (Creativity)

```javascript
// Constants at the top of background.js
const TEMPERATURE = 0.7;  // Default

// Lower (0.3-0.5) = More consistent, predictable
// Higher (0.8-1.0) = More creative, varied
```

GPT-6 models only accept `temperature` when `reasoning_effort` is `'none'`. If you change `REASONING_EFFORT`, remove `temperature` from the request body in `streamOpenAI()` or the API returns a 400 error.

### Reasoning Effort

```javascript
const REASONING_EFFORT = 'none';  // Default - fastest, no hidden reasoning tokens

// Also: 'low', 'medium', 'high', 'xhigh', 'max'
// Higher effort = slower and more expensive; reasoning tokens count toward max_completion_tokens
```

### Max Completion Tokens (Response Length)

```javascript
const MAX_COMPLETION_TOKENS = 800;  // Default

// Lower (400-600) = Shorter responses, lower cost
// Higher (1000-1500) = Longer responses, higher cost
```

GPT-6 models reject the older `max_tokens` parameter; use `max_completion_tokens`.

### Model Selection

Pick the model in **Settings → AI Model**. To add a model to the dropdown, add an entry to `models.js` with its prices (used for cost estimates):

```javascript
const AAI_MODELS = {
  'gpt-6-luna': { label: 'GPT-6 Luna (recommended)', inputPer1M: 0.10, outputPer1M: 0.50 },
  'gpt-6-sol':  { label: 'GPT-6 Sol (higher quality)', inputPer1M: 2.00, outputPer1M: 10.00 }
};
```

## Content Script Customization

### Selection Requirements

Modify in `content.js`:

```javascript
const MIN_SELECTION_LENGTH = 10;  // Minimum characters

// Increase for longer text only
const MIN_SELECTION_LENGTH = 20;

// Decrease for shorter snippets (not recommended)
const MIN_SELECTION_LENGTH = 5;
```

### Button Position and Appearance

```javascript
const BUTTON_OFFSET_PX = 10;  // Distance from selection

// Adjust button position in showFloatingButton()
let top = rect.top + window.scrollY - BUTTON_OFFSET_PX - 40;
let left = rect.right + window.scrollX - 20;

// Modify these values to change positioning
```

### Debounce Timing

```javascript
const SELECTION_DEBOUNCE_MS = 300;  // Delay before showing button

// Faster response (may be too sensitive)
const SELECTION_DEBOUNCE_MS = 150;

// Slower response (more deliberate)
const SELECTION_DEBOUNCE_MS = 500;
```

## Storage Customization

### Using chrome.storage.sync Instead of chrome.storage.local

By default, the extension uses `chrome.storage.local` for all data. To sync settings across Chrome browsers:

1. In `background.js`, replace `chrome.storage.local` with `chrome.storage.sync` for:
   - `prompt_url` (recommended)
   - User preferences (if you add them)

2. **DO NOT** sync the API key for security reasons

3. Note: `chrome.storage.sync` has quota limits (100KB total, 8KB per item)

## Domain Restrictions

### Adding Additional Domains

Modify `manifest.json`:

```json
"content_scripts": [
  {
    "matches": [
      "*://*.vinsolutions.com/*",
      "*://*.vinsolutions.app.coxautoinc.com/*",
      "*://*.yourdomain.com/*",           // Add your domain
      "*://*.anotherdomain.com/*"         // Add more as needed
    ],
    ...
  }
]
```

### Testing on All Sites

For development only:

```json
"matches": [
  "*://*/*"  // Matches all domains
]
```

**⚠️ Remove this before production!**

## Custom Styling

### Changing Colors

Edit `styles/content.css`:

```css
/* Change gradient colors */
.aai-crm-floating-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  /* Replace with your brand colors */
  background: linear-gradient(135deg, #your-color-1 0%, #your-color-2 100%);
}

/* Change button size */
.aai-crm-floating-button {
  width: 40px;   /* Increase for larger button */
  height: 40px;
}
```

### Modal Dimensions

```css
.aai-crm-modal-content {
  max-width: 600px;  /* Increase for wider modal */
  width: 90%;        /* Percentage of viewport */
}
```

## API Timeout and Retry

### Adjusting Timeout

In `background.js`:

```javascript
const API_TIMEOUT_MS = 15000;  // 15 seconds default

// For slower connections
const API_TIMEOUT_MS = 30000;  // 30 seconds

// For faster response (may fail on slow connections)
const API_TIMEOUT_MS = 10000;  // 10 seconds
```

### Adding Retry Logic

Currently, errors show a retry button. To add automatic retries:

```javascript
// In handleEnhanceText() function, wrap the API call:
let retries = 3;
while (retries > 0) {
  try {
    const enhancedText = await callOpenAI(apiKey, messages);
    return { enhancedText };
  } catch (error) {
    retries--;
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
  }
}
```

## Logging and Debugging

### Enable Verbose Logging

Add to top of each file:

```javascript
const DEBUG = true;

// Replace console.log with:
if (DEBUG) console.log('Debug message', data);
```

### Monitor API Usage

Add usage tracking in `background.js`:

```javascript
// After successful API call
chrome.storage.local.get(['api_usage_count'], (result) => {
  const count = (result.api_usage_count || 0) + 1;
  chrome.storage.local.set({ api_usage_count: count });
  console.log('Total API calls:', count);
});
```

## Security Hardening

### Content Security Policy

Add to `manifest.json`:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

### API Key Encryption

For enhanced security, consider encrypting the API key before storage (requires crypto library).

## Performance Optimization

### Reduce Extension Size

1. Minify CSS and JavaScript files
2. Remove console.log statements in production
3. Compress icon files

### Optimize Content Script Loading

```json
// In manifest.json, use run_at options:
"run_at": "document_idle"  // Default - loads after page

// Alternatives:
"run_at": "document_end"   // Faster, but may miss some content
"run_at": "document_start" // Earliest, but page not ready
```

## Multi-Language Support

To add multi-language prompts:

1. Create separate prompt URLs for each language
2. Add language detection in content script
3. Store language preference in chrome.storage.sync
4. Use appropriate prompt URL based on language

## Analytics and Monitoring

### Track Usage Statistics

Add to `background.js`:

```javascript
// Track enhancement counts, errors, response times
const analytics = {
  total_enhancements: 0,
  errors: 0,
  avg_response_time: 0
};

// Update after each API call
chrome.storage.local.set({ analytics });
```

### Display Stats in Options Page

Add a statistics section to `options.html` showing:
- Total enhancements performed
- API success rate
- Average response time
- Last error (if any)

## Additional Features to Consider

1. **Text Templates**: Pre-defined templates for common scenarios
2. **History**: Save previous enhancements for reference
3. **Favorites**: Star and save best responses
4. **Batch Mode**: Enhance multiple text blocks at once
5. **Keyboard Shortcuts**: Hotkeys for quick access
6. **Custom Voices**: Multiple system prompts for different contexts
7. **Diff View**: Show changes between original and enhanced

---

**Need help with advanced customization?** Review the code comments in each file for detailed implementation notes.
