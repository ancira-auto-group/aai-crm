/**
 * Background Service Worker for AAI CRM Extension
 * Handles OpenAI API calls and system prompt refresh
 */

importScripts('models.js');

// Constants
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const MAX_COMPLETION_TOKENS = 800;
const TEMPERATURE = 0.7; // Only honored because reasoning_effort is 'none'
const REASONING_EFFORT = 'none'; // Text rewriting doesn't need reasoning; keeps replies fast and cheap
const API_TIMEOUT_MS = 15000; // Max wait for the first byte, and between streamed chunks
const GENERATE_PORT_NAME = 'aai-generate';
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
    'response_prompt', 'response_url',
    'openai_api_key', 'remember_api_key', 'model'
  ], (result) => {
    // Keys saved before session-only storage existed stay remembered, so upgrades don't lose them
    if (result.openai_api_key && result.remember_api_key === undefined) {
      chrome.storage.local.set({ remember_api_key: true });
    }
    if (!result.model || !AAI_MODELS[result.model]) {
      chrome.storage.local.set({ model: AAI_DEFAULT_MODEL });
    }

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
 * Get the API key: session storage (default, cleared when the browser closes)
 * or local storage (when the user opted to remember it).
 */
async function getApiKey() {
  const session = await chrome.storage.session.get(['openai_api_key']);
  if (session.openai_api_key) {
    return session.openai_api_key;
  }
  const local = await chrome.storage.local.get(['openai_api_key']);
  return local.openai_api_key || null;
}

/**
 * Get the configured model, falling back to the default if unknown
 */
async function getModel() {
  const result = await chrome.storage.local.get(['model']);
  return AAI_MODELS[result.model] ? result.model : AAI_DEFAULT_MODEL;
}

/**
 * Handle one-shot messages from content script, popup and options page
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    Promise.all([getApiKey(), getModel()])
      .then(([apiKey, model]) => sendResponse({ hasApiKey: !!apiKey, model }))
      .catch((error) => sendResponse({ hasApiKey: false, error: error.message }));
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
    testApiKey(request.apiKey, request.model)
      .then(sendResponse)
      .catch((error) => {
        console.error('AAI CRM Extension: Error in testApiKey', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * Handle streaming generation requests from the content script.
 * Protocol (port messages to the content script):
 *   { type: 'delta', text }  - next chunk of generated text
 *   { type: 'done', text, usage } - generation finished
 *   { type: 'error', error } - generation failed
 * Disconnecting the port (e.g. closing the modal) cancels the request.
 * One request per port.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== GENERATE_PORT_NAME) {
    return;
  }

  const controller = new AbortController();
  let disconnected = false;

  port.onDisconnect.addListener(() => {
    disconnected = true;
    controller.abort();
  });

  const post = (message) => {
    if (!disconnected) {
      port.postMessage(message);
    }
  };

  port.onMessage.addListener(async (request) => {
    try {
      const messages = await buildMessages(request.mode, request.text, request.additionalContext);
      const apiKey = await getApiKey();

      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const model = await getModel();
      const { text, usage } = await streamOpenAI(apiKey, model, messages, controller.signal, (delta) => {
        post({ type: 'delta', text: delta });
      });

      if (usage) {
        await recordUsage(model, usage);
      }

      post({ type: 'done', text: text.trim(), usage });
    } catch (error) {
      if (disconnected) {
        return; // Cancelled by the user, nobody to report to
      }
      console.error('AAI CRM Extension: Error generating text', error);
      post({ type: 'error', error: error.message });
    }
    // The content script disconnects once it has received 'done' or 'error'
  });
});

/**
 * Build the chat messages for enhance or response mode
 */
async function buildMessages(mode, text, additionalContext = '') {
  let messages;

  if (mode === 'enhance') {
    const result = await chrome.storage.local.get(['enhance_prompt']);
    messages = [
      { role: 'system', content: result.enhance_prompt || DEFAULT_ENHANCE_PROMPT },
      { role: 'user', content: `Please enhance the following text:\n\n${text}` }
    ];
  } else if (mode === 'response') {
    const result = await chrome.storage.local.get(['response_prompt']);
    messages = [
      { role: 'system', content: result.response_prompt || DEFAULT_RESPONSE_PROMPT },
      { role: 'user', content: text }
    ];
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

  if (additionalContext) {
    messages.push({
      role: 'user',
      content: `Additional instructions: ${additionalContext}`
    });
  }

  return messages;
}

/**
 * Convert an OpenAI error response into a user-facing Error
 */
async function toApiError(response) {
  const errorData = await response.json().catch(() => ({}));
  const errorMessage = errorData.error?.message || `API Error: ${response.status} ${response.statusText}`;

  if (response.status === 401) {
    return new Error('Invalid API key. Please check your settings.');
  } else if (response.status === 404) {
    return new Error(`Model not available for this API key. ${errorMessage}`);
  } else if (response.status === 429) {
    return new Error('Rate limit exceeded. Please try again later.');
  } else if (response.status === 500 || response.status === 503) {
    return new Error('OpenAI service temporarily unavailable. Please try again.');
  }
  return new Error(errorMessage);
}

/**
 * Call the OpenAI Chat Completions API with streaming.
 * Calls onDelta for each chunk of text; resolves with the full text and token usage.
 */
async function streamOpenAI(apiKey, model, messages, externalSignal, onDelta) {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;

  // Abort if the server goes quiet for too long (before the first byte or between chunks)
  const resetTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, API_TIMEOUT_MS);
  };
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  try {
    resetTimeout();

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        temperature: TEMPERATURE,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage = null;
    let finishReason = null;

    // Parse server-sent events: lines of "data: {json}", terminated by "data: [DONE]"
    while (true) {
      resetTimeout();
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep any partial line for the next chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          continue;
        }

        const chunk = JSON.parse(data);
        if (chunk.error) {
          throw new Error(chunk.error.message || 'OpenAI streaming error');
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }

        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }

    if (!text.trim()) {
      throw new Error('Empty response from OpenAI API');
    }
    if (finishReason === 'length') {
      console.warn('AAI CRM Extension: Response hit max_completion_tokens and may be cut off');
    }

    return { text, usage };

  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(timedOut ? 'Request timed out. Please try again.' : 'Request cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Estimate the USD cost of a request from its token usage
 */
function estimateCost(model, usage) {
  const pricing = AAI_MODELS[model];
  if (!pricing) {
    return 0;
  }
  return (usage.prompt_tokens * pricing.inputPer1M + usage.completion_tokens * pricing.outputPer1M) / 1e6;
}

// Serializes usage writes so concurrent requests don't overwrite each other
let usageWriteChain = Promise.resolve();

/**
 * Record token usage and estimated cost, bucketed by month (YYYY-MM)
 */
function recordUsage(model, usage) {
  const cost = estimateCost(model, usage);
  console.log(
    `AAI CRM Extension: ${model} used ${usage.prompt_tokens} input + ${usage.completion_tokens} output tokens (~$${cost.toFixed(5)})`
  );

  usageWriteChain = usageWriteChain.then(async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const result = await chrome.storage.local.get(['usage_stats']);
    const stats = result.usage_stats || {};
    const bucket = stats[month] || { requests: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };

    bucket.requests += 1;
    bucket.input_tokens += usage.prompt_tokens;
    bucket.output_tokens += usage.completion_tokens;
    bucket.cost_usd += cost;
    stats[month] = bucket;

    await chrome.storage.local.set({ usage_stats: stats });
  }).catch((error) => {
    console.error('AAI CRM Extension: Error recording usage', error);
  });

  return usageWriteChain;
}

/**
 * Test API key validity and access to the selected model.
 * Uses the free model-lookup endpoint, so it costs no tokens.
 */
async function testApiKey(apiKey, model) {
  const modelId = AAI_MODELS[model] ? model : await getModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENAI_MODELS_URL}/${encodeURIComponent(modelId)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    return { success: true, model: modelId };

  } catch (error) {
    const message = error.name === 'AbortError' ? 'Request timed out. Please try again.' : error.message;
    return { success: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

console.log('AAI CRM Extension: Background service worker initialized');
