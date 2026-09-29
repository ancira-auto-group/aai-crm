/**
 * Background Service Worker for AAI CRM Extension
 * Handles OpenAI API calls and system prompt refresh
 */

// Constants
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5-mini'; // Using gpt-5-mini for enhanced performance
const MAX_TOKENS = 800;
const API_TIMEOUT_MS = 15000;
const DAILY_ALARM_ENHANCE = 'dailyEnhancePromptRefresh';
const DAILY_ALARM_RESPONSE = 'dailyResponsePromptRefresh';
const PROMPT_REFRESH_TIME = { hour: 0, minute: 1 }; // 00:01 local time
const PROMPT_AGE_WARNING_DAYS = 7;

// Default enhancement system prompt (fallback)
const DEFAULT_ENHANCE_PROMPT = `You are a professional text enhancement assistant for automotive CRM communications. Your goal is to improve clarity, professionalism, and impact while preserving all key information.

Guidelines:
- Maintain the original meaning and key details
- Enhance clarity and readability
- Use professional but friendly tone appropriate for automotive industry
- Fix grammar and spelling errors
- Improve sentence structure and flow
- Keep the response concise and natural
- Do not add information that wasn't in the original text`;

// Default response system prompt (fallback)
const DEFAULT_RESPONSE_PROMPT = `You are a professional response assistant for automotive CRM communications. Your goal is to suggest appropriate responses based on the customer's message.`;

// Default prompt URLs (GitHub Gist)
const DEFAULT_ENHANCE_URL = 'https://gist.githubusercontent.com/29834329834932840320392/84b7d5917357b2d444b4b4b90fa384be/raw/aai-crm-system-prompt.txt';
const DEFAULT_RESPONSE_URL = 'https://gist.githubusercontent.com/29834329834932840320392/7b24a6516236bb09849c921799802700/raw/aai-crm-response-system-prompt.txt';

/**
 * Initialize the extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('AAI CRM Extension: Installed/Updated', details.reason);

  // Set up daily alarms for both prompts
  setupDailyAlarms();

  // Initialize storage with defaults if needed
  chrome.storage.local.get([
    'enhance_prompt', 'enhance_url',
    'response_prompt', 'response_url'
  ], (result) => {
    // Enhancement prompt
    if (!result.enhance_prompt) {
      chrome.storage.local.set({
        enhance_prompt: DEFAULT_ENHANCE_PROMPT,
        enhance_last_updated: Date.now()
      });
    }
    if (!result.enhance_url) {
      chrome.storage.local.set({ enhance_url: DEFAULT_ENHANCE_URL });
    }

    // Response prompt
    if (!result.response_prompt) {
      chrome.storage.local.set({
        response_prompt: DEFAULT_RESPONSE_PROMPT,
        response_last_updated: Date.now()
      });
    }
    if (!result.response_url) {
      chrome.storage.local.set({ response_url: DEFAULT_RESPONSE_URL });
    }
  });

  // Fetch both prompts on install
  if (details.reason === 'install') {
    fetchEnhancePrompt();
    fetchResponsePrompt();
  }
});

/**
 * Set up daily alarms for both prompts
 */
function setupDailyAlarms() {
  // Clear existing alarms
  chrome.alarms.clear(DAILY_ALARM_ENHANCE);
  chrome.alarms.clear(DAILY_ALARM_RESPONSE);

  // Create alarms for daily refresh at 00:01
  chrome.alarms.create(DAILY_ALARM_ENHANCE, {
    when: getNextRefreshTime(),
    periodInMinutes: 24 * 60 // Daily
  });

  chrome.alarms.create(DAILY_ALARM_RESPONSE, {
    when: getNextRefreshTime(),
    periodInMinutes: 24 * 60 // Daily
  });

  console.log('AAI CRM Extension: Daily prompt refresh alarms set');
}

/**
 * Get the next refresh time (00:01 local time)
 */
function getNextRefreshTime() {
  const now = new Date();
  const next = new Date();
  next.setHours(PROMPT_REFRESH_TIME.hour, PROMPT_REFRESH_TIME.minute, 0, 0);

  // If time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime();
}

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_ALARM_ENHANCE) {
    console.log('AAI CRM Extension: Daily enhance prompt refresh triggered');
    fetchEnhancePrompt();
  } else if (alarm.name === DAILY_ALARM_RESPONSE) {
    console.log('AAI CRM Extension: Daily response prompt refresh triggered');
    fetchResponsePrompt();
  }
});

/**
 * Fetch enhancement prompt from URL
 */
async function fetchEnhancePrompt() {
  try {
    const result = await chrome.storage.local.get(['enhance_url']);
    const promptUrl = result.enhance_url || DEFAULT_ENHANCE_URL;

    console.log('AAI CRM Extension: Fetching enhance prompt from', promptUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(promptUrl, {
      signal: controller.signal,
      cache: 'no-cache'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const promptText = await response.text();

    if (!promptText || promptText.trim().length === 0) {
      throw new Error('Empty prompt received');
    }

    // Save to storage
    await chrome.storage.local.set({
      enhance_prompt: promptText.trim(),
      enhance_last_updated: Date.now(),
      enhance_fetch_error: null
    });

    console.log('AAI CRM Extension: Enhance prompt updated successfully');
    return { success: true };

  } catch (error) {
    console.error('AAI CRM Extension: Error fetching enhance prompt', error);

    // Save error to storage
    await chrome.storage.local.set({
      enhance_fetch_error: error.message
    });

    // Use cached prompt or default
    const result = await chrome.storage.local.get(['enhance_prompt']);
    if (!result.enhance_prompt) {
      await chrome.storage.local.set({
        enhance_prompt: DEFAULT_ENHANCE_PROMPT,
        enhance_last_updated: Date.now()
      });
    }

    return { success: false, error: error.message };
  }
}

/**
 * Fetch response prompt from URL
 */
async function fetchResponsePrompt() {
  try {
    const result = await chrome.storage.local.get(['response_url']);
    const promptUrl = result.response_url || DEFAULT_RESPONSE_URL;

    console.log('AAI CRM Extension: Fetching response prompt from', promptUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(promptUrl, {
      signal: controller.signal,
      cache: 'no-cache'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const promptText = await response.text();

    if (!promptText || promptText.trim().length === 0) {
      throw new Error('Empty prompt received');
    }

    // Save to storage
    await chrome.storage.local.set({
      response_prompt: promptText.trim(),
      response_last_updated: Date.now(),
      response_fetch_error: null
    });

    console.log('AAI CRM Extension: Response prompt updated successfully');
    return { success: true };

  } catch (error) {
    console.error('AAI CRM Extension: Error fetching response prompt', error);

    // Save error to storage
    await chrome.storage.local.set({
      response_fetch_error: error.message
    });

    // Use cached prompt or default
    const result = await chrome.storage.local.get(['response_prompt']);
    if (!result.response_prompt) {
      await chrome.storage.local.set({
        response_prompt: DEFAULT_RESPONSE_PROMPT,
        response_last_updated: Date.now()
      });
    }

    return { success: false, error: error.message };
  }
}

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'enhanceText') {
    handleEnhanceText(request.text, request.additionalContext)
      .then(sendResponse)
      .catch((error) => {
        console.error('AAI CRM Extension: Error in enhanceText', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === 'suggestResponse') {
    handleSuggestResponse(request.text, request.additionalContext)
      .then(sendResponse)
      .catch((error) => {
        console.error('AAI CRM Extension: Error in suggestResponse', error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === 'fetchEnhancePrompt') {
    fetchEnhancePrompt()
      .then(sendResponse)
      .catch((error) => {
        console.error('AAI CRM Extension: Error in fetchEnhancePrompt', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'fetchResponsePrompt') {
    fetchResponsePrompt()
      .then(sendResponse)
      .catch((error) => {
        console.error('AAI CRM Extension: Error in fetchResponsePrompt', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'testApiKey') {
    testApiKey(request.apiKey)
      .then(sendResponse)
      .catch((error) => {
        console.error('AAI CRM Extension: Error in testApiKey', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * Handle text enhancement request
 */
async function handleEnhanceText(text, additionalContext = '') {
  try {
    // Get API key and enhance prompt from storage
    const result = await chrome.storage.local.get(['openai_api_key', 'enhance_prompt']);

    if (!result.openai_api_key) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = result.enhance_prompt || DEFAULT_ENHANCE_PROMPT;

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please enhance the following text:\n\n${text}` }
    ];

    // Add additional context if provided
    if (additionalContext) {
      messages.push({
        role: 'user',
        content: `Additional instructions: ${additionalContext}`
      });
    }

    // Call OpenAI API
    const enhancedText = await callOpenAI(result.openai_api_key, messages);

    return { enhancedText };

  } catch (error) {
    console.error('AAI CRM Extension: Error enhancing text', error);
    throw error;
  }
}

/**
 * Handle response suggestion request
 */
async function handleSuggestResponse(text, additionalContext = '') {
  try {
    // Get API key and response prompt from storage
    const result = await chrome.storage.local.get(['openai_api_key', 'response_prompt']);

    if (!result.openai_api_key) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = result.response_prompt || DEFAULT_RESPONSE_PROMPT;

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    // Add additional context if provided
    if (additionalContext) {
      messages.push({
        role: 'user',
        content: `Additional instructions: ${additionalContext}`
      });
    }

    // Call OpenAI API
    const suggestedResponse = await callOpenAI(result.openai_api_key, messages);

    return { suggestedResponse };

  } catch (error) {
    console.error('AAI CRM Extension: Error suggesting response', error);
    throw error;
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(apiKey, messages) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `API Error: ${response.status} ${response.statusText}`;

      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your settings.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (response.status === 500 || response.status === 503) {
        throw new Error('OpenAI service temporarily unavailable. Please try again.');
      } else {
        throw new Error(errorMessage);
      }
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from OpenAI API');
    }

    return data.choices[0].message.content.trim();

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }

    throw error;
  }
}

/**
 * Test API key validity
 */
async function testApiKey(apiKey) {
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "OK"' }
    ];

    await callOpenAI(apiKey, messages);
    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

console.log('AAI CRM Extension: Background service worker initialized');
