/**
 * Options Page Script for AAI CRM Extension
 * Handles settings management and user interactions
 */

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const testConnectionBtn = document.getElementById('testConnection');
const apiStatusBox = document.getElementById('apiStatus');

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
function loadSettings() {
  // Load API key (show masked version)
  chrome.storage.local.get([
    'openai_api_key',
    'enhance_url', 'enhance_last_updated',
    'response_url', 'response_last_updated'
  ], (result) => {
    if (result.openai_api_key) {
      apiKeyInput.value = maskApiKey(result.openai_api_key);
      apiKeyInput.dataset.originalKey = result.openai_api_key;
    }

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
    await chrome.storage.local.set({ openai_api_key: apiKey });
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
      apiKey: apiKey
    });

    if (response.success) {
      showStatus(apiStatusBox, 'Connection successful! API key is valid.', 'success');
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
