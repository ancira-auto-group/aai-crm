/**
 * Options Page Script for AAI CRM Extension
 * Handles settings management and user interactions
 */

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const testConnectionBtn = document.getElementById('testConnection');
const apiStatusBox = document.getElementById('apiStatus');
const rememberApiKeyInput = document.getElementById('rememberApiKey');

// Model elements
const modelSelect = document.getElementById('model');
const modelStatusBox = document.getElementById('modelStatus');

// Usage elements
const usageBody = document.getElementById('usageBody');
const resetUsageBtn = document.getElementById('resetUsage');

// Enhancement prompt elements
const enhanceUrlInput = document.getElementById('enhanceUrl');
const saveEnhanceUrlBtn = document.getElementById('saveEnhanceUrl');
const refreshEnhancePromptBtn = document.getElementById('refreshEnhancePrompt');
const enhanceStatusBox = document.getElementById('enhanceStatus');
const enhanceLastUpdatedSpan = document.getElementById('enhanceLastUpdated');

// Response prompt elements
const responseUrlInput = document.getElementById('responseUrl');
const saveResponseUrlBtn = document.getElementById('saveResponseUrl');
const refreshResponsePromptBtn = document.getElementById('refreshResponsePrompt');
const responseStatusBox = document.getElementById('responseStatus');
const responseLastUpdatedSpan = document.getElementById('responseLastUpdated');

/**
 * Initialize the options page
 */
function init() {
  loadSettings();
  setupEventListeners();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  // Model dropdown
  for (const [id, model] of Object.entries(AAI_MODELS)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${model.label} - $${model.inputPer1M.toFixed(2)} in / $${model.outputPer1M.toFixed(2)} out per 1M tokens`;
    modelSelect.appendChild(option);
  }

  // API key lives in session storage unless the user chose to remember it
  const session = await chrome.storage.session.get(['openai_api_key']);

  chrome.storage.local.get([
    'openai_api_key', 'remember_api_key', 'model', 'usage_stats',
    'enhance_url', 'enhance_last_updated',
    'response_url', 'response_last_updated'
  ], (result) => {
    const apiKey = session.openai_api_key || result.openai_api_key;
    if (apiKey) {
      apiKeyInput.value = maskApiKey(apiKey);
      apiKeyInput.dataset.originalKey = apiKey;
    }
    rememberApiKeyInput.checked = !!result.remember_api_key;

    modelSelect.value = AAI_MODELS[result.model] ? result.model : AAI_DEFAULT_MODEL;

    renderUsage(result.usage_stats);

    // Enhancement prompt
    if (result.enhance_url) {
      enhanceUrlInput.value = result.enhance_url;
    }
    if (result.enhance_last_updated) {
      updateLastUpdatedTime(result.enhance_last_updated, enhanceLastUpdatedSpan);
    }

    // Response prompt
    if (result.response_url) {
      responseUrlInput.value = result.response_url;
    }
    if (result.response_last_updated) {
      updateLastUpdatedTime(result.response_last_updated, responseLastUpdatedSpan);
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // API Key handlers
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  testConnectionBtn.addEventListener('click', testConnection);
  apiKeyInput.addEventListener('focus', handleApiKeyFocus);
  apiKeyInput.addEventListener('blur', handleApiKeyBlur);
  rememberApiKeyInput.addEventListener('change', handleRememberChange);

  // Model handler
  modelSelect.addEventListener('change', saveModel);

  // Usage handlers
  resetUsageBtn.addEventListener('click', resetUsage);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.usage_stats) {
      renderUsage(changes.usage_stats.newValue);
    }
  });

  // Enhancement prompt handlers
  saveEnhanceUrlBtn.addEventListener('click', saveEnhanceUrl);
  refreshEnhancePromptBtn.addEventListener('click', refreshEnhancePrompt);

  // Response prompt handlers
  saveResponseUrlBtn.addEventListener('click', saveResponseUrl);
  refreshResponsePromptBtn.addEventListener('click', refreshResponsePrompt);
}

/**
 * Handle API key input focus (clear mask)
 */
function handleApiKeyFocus() {
  if (apiKeyInput.dataset.originalKey) {
    apiKeyInput.value = apiKeyInput.dataset.originalKey;
    apiKeyInput.type = 'text';
  }
}

/**
 * Handle API key input blur (restore mask)
 */
function handleApiKeyBlur() {
  if (apiKeyInput.dataset.originalKey && apiKeyInput.value === apiKeyInput.dataset.originalKey) {
    apiKeyInput.value = maskApiKey(apiKeyInput.dataset.originalKey);
    apiKeyInput.type = 'password';
  }
}

/**
 * Mask API key for display
 */
function maskApiKey(key) {
  if (!key) return '';
  if (key.length < 12) return '••••••••';
  return key.substring(0, 7) + '•'.repeat(32) + key.substring(key.length - 4);
}

/**
 * Save API key
 */
async function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus(apiStatusBox, 'Please enter an API key', 'error');
    return;
  }

  // Don't save if it's the masked version
  if (apiKey.includes('••')) {
    showStatus(apiStatusBox, 'API key already saved', 'success');
    return;
  }

  // Basic validation
  if (!apiKey.startsWith('sk-')) {
    showStatus(apiStatusBox, 'Invalid API key format. OpenAI keys start with "sk-"', 'error');
    return;
  }

  try {
    await storeApiKey(apiKey, rememberApiKeyInput.checked);
    apiKeyInput.dataset.originalKey = apiKey;
    apiKeyInput.value = maskApiKey(apiKey);
    apiKeyInput.type = 'password';
    showStatus(apiStatusBox, 'API key saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving API key:', error);
    showStatus(apiStatusBox, 'Failed to save API key', 'error');
  }
}

/**
 * Store the API key in session storage (cleared when the browser closes)
 * or local storage (remembered), and remove it from the other.
 */
async function storeApiKey(apiKey, remember) {
  if (remember) {
    await chrome.storage.local.set({ openai_api_key: apiKey, remember_api_key: true });
    await chrome.storage.session.remove('openai_api_key');
  } else {
    await chrome.storage.session.set({ openai_api_key: apiKey });
    await chrome.storage.local.remove('openai_api_key');
    await chrome.storage.local.set({ remember_api_key: false });
  }
}

/**
 * Move an already-saved key when the "remember" checkbox changes
 */
async function handleRememberChange() {
  const apiKey = apiKeyInput.dataset.originalKey;
  const remember = rememberApiKeyInput.checked;

  try {
    if (apiKey) {
      await storeApiKey(apiKey, remember);
      showStatus(apiStatusBox, remember
        ? 'API key will be remembered on this computer.'
        : 'API key will be forgotten when the browser closes.', 'success');
    } else {
      await chrome.storage.local.set({ remember_api_key: remember });
    }
  } catch (error) {
    console.error('Error updating API key storage:', error);
    showStatus(apiStatusBox, 'Failed to update API key storage', 'error');
  }
}

/**
 * Save selected model
 */
async function saveModel() {
  try {
    await chrome.storage.local.set({ model: modelSelect.value });
    showStatus(modelStatusBox, `Model set to ${modelSelect.value}`, 'success');
  } catch (error) {
    console.error('Error saving model:', error);
    showStatus(modelStatusBox, 'Failed to save model', 'error');
  }
}

/**
 * Render monthly usage stats, newest month first, with an all-time total
 */
function renderUsage(stats) {
  usageBody.textContent = '';
  const months = Object.keys(stats || {}).sort().reverse();

  if (months.length === 0) {
    const row = usageBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = 'No usage recorded yet';
    return;
  }

  const total = { requests: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
  const addRow = (label, bucket, className) => {
    const row = usageBody.insertRow();
    if (className) row.className = className;
    [
      label,
      bucket.requests.toLocaleString(),
      bucket.input_tokens.toLocaleString(),
      bucket.output_tokens.toLocaleString(),
      `$${bucket.cost_usd.toFixed(bucket.cost_usd < 0.01 ? 5 : bucket.cost_usd < 1 ? 4 : 2)}`
    ].forEach(value => { row.insertCell().textContent = value; });
  };

  for (const month of months) {
    const bucket = stats[month];
    addRow(month, bucket);
    for (const key of Object.keys(total)) {
      total[key] += bucket[key];
    }
  }

  if (months.length > 1) {
    addRow('All time', total, 'total');
  }
}

/**
 * Reset usage stats
 */
async function resetUsage() {
  if (!confirm('Reset all recorded usage?')) {
    return;
  }
  await chrome.storage.local.remove('usage_stats');
  renderUsage(null);
}

/**
 * Test API connection
 */
async function testConnection() {
  const apiKey = apiKeyInput.dataset.originalKey || apiKeyInput.value.trim();

  if (!apiKey || apiKey.includes('••')) {
    showStatus(apiStatusBox, 'Please enter an API key first', 'error');
    return;
  }

  // Show loading state
  testConnectionBtn.disabled = true;
  testConnectionBtn.innerHTML = '<span class="spinner"></span>Testing...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testApiKey',
      apiKey: apiKey,
      model: modelSelect.value
    });

    if (response.success) {
      showStatus(apiStatusBox, `Connection successful! API key is valid and has access to ${response.model}.`, 'success');
    } else {
      showStatus(apiStatusBox, `Connection failed: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Error testing API key:', error);
    showStatus(apiStatusBox, 'Failed to test connection. Please try again.', 'error');
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'Test Connection';
  }
}

/**
 * Save enhancement prompt URL
 */
async function saveEnhanceUrl() {
  const promptUrl = enhanceUrlInput.value.trim();

  if (!promptUrl) {
    showStatus(enhanceStatusBox, 'Please enter a prompt URL', 'error');
    return;
  }

  // Basic URL validation
  try {
    new URL(promptUrl);
  } catch (error) {
    showStatus(enhanceStatusBox, 'Invalid URL format', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({ enhance_url: promptUrl });
    showStatus(enhanceStatusBox, 'Enhancement prompt URL saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving enhancement prompt URL:', error);
    showStatus(enhanceStatusBox, 'Failed to save prompt URL', 'error');
  }
}

/**
 * Save response prompt URL
 */
async function saveResponseUrl() {
  const promptUrl = responseUrlInput.value.trim();

  if (!promptUrl) {
    showStatus(responseStatusBox, 'Please enter a prompt URL', 'error');
    return;
  }

  // Basic URL validation
  try {
    new URL(promptUrl);
  } catch (error) {
    showStatus(responseStatusBox, 'Invalid URL format', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({ response_url: promptUrl });
    showStatus(responseStatusBox, 'Response prompt URL saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving response prompt URL:', error);
    showStatus(responseStatusBox, 'Failed to save prompt URL', 'error');
  }
}

/**
 * Refresh enhancement prompt
 */
async function refreshEnhancePrompt() {
  // Show loading state
  refreshEnhancePromptBtn.disabled = true;
  refreshEnhancePromptBtn.innerHTML = '<span class="spinner"></span>Refreshing...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'fetchEnhancePrompt' });

    if (response.success) {
      showStatus(enhanceStatusBox, 'Enhancement prompt updated successfully!', 'success');

      // Update last updated time
      const result = await chrome.storage.local.get(['enhance_last_updated']);
      if (result.enhance_last_updated) {
        updateLastUpdatedTime(result.enhance_last_updated, enhanceLastUpdatedSpan);
      }
    } else {
      showStatus(enhanceStatusBox, `Failed to update prompt: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Error refreshing enhancement prompt:', error);
    showStatus(enhanceStatusBox, 'Failed to refresh prompt. Please try again.', 'error');
  } finally {
    refreshEnhancePromptBtn.disabled = false;
    refreshEnhancePromptBtn.textContent = 'Check for Updated Prompt';
  }
}

/**
 * Refresh response prompt
 */
async function refreshResponsePrompt() {
  // Show loading state
  refreshResponsePromptBtn.disabled = true;
  refreshResponsePromptBtn.innerHTML = '<span class="spinner"></span>Refreshing...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'fetchResponsePrompt' });

    if (response.success) {
      showStatus(responseStatusBox, 'Response prompt updated successfully!', 'success');

      // Update last updated time
      const result = await chrome.storage.local.get(['response_last_updated']);
      if (result.response_last_updated) {
        updateLastUpdatedTime(result.response_last_updated, responseLastUpdatedSpan);
      }
    } else {
      showStatus(responseStatusBox, `Failed to update prompt: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Error refreshing response prompt:', error);
    showStatus(responseStatusBox, 'Failed to refresh prompt. Please try again.', 'error');
  } finally {
    refreshResponsePromptBtn.disabled = false;
    refreshResponsePromptBtn.textContent = 'Check for Updated Prompt';
  }
}

/**
 * Update last updated time display
 */
function updateLastUpdatedTime(timestamp, spanElement) {
  const date = new Date(timestamp);
  const now = new Date();
  const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  let timeString;
  if (daysDiff === 0) {
    timeString = 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (daysDiff === 1) {
    timeString = 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (daysDiff < 7) {
    timeString = `${daysDiff} days ago`;
  } else {
    timeString = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  spanElement.textContent = timeString;

  // Show warning if prompt is old
  if (daysDiff >= 7) {
    spanElement.style.color = '#dc2626';
    spanElement.style.fontWeight = '600';
  } else {
    spanElement.style.color = '';
    spanElement.style.fontWeight = '';
  }
}

/**
 * Show status message
 */
function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status-box ${type}`;
  element.style.display = 'block';

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
