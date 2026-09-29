/**
 * Popup Script for AAI CRM Extension
 * Handles popup UI interactions
 */

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const openSettingsBtn = document.getElementById('openSettings');
const testOnPageBtn = document.getElementById('testOnPage');

/**
 * Initialize popup
 */
function init() {
  checkConfiguration();
  setupEventListeners();
}

/**
 * Check if extension is properly configured
 */
async function checkConfiguration() {
  chrome.storage.local.get(['openai_api_key', 'system_prompt'], (result) => {
    if (!result.openai_api_key) {
      statusDot.classList.add('inactive');
      statusText.textContent = 'API key not configured';
    } else {
      statusDot.classList.remove('inactive');
      statusText.textContent = 'Ready to enhance text';
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  testOnPageBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.example.com' });
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
