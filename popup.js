/**
 * Popup Script for AAI CRM Extension
 * Handles popup UI interactions
 */

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const openSettingsBtn = document.getElementById('openSettings');
const testOnPageBtn = document.getElementById('testOnPage');
const versionText = document.getElementById('versionText');

/**
 * Initialize popup
 */
function init() {
  versionText.textContent = `Version ${chrome.runtime.getManifest().version}`;
  checkConfiguration();
  setupEventListeners();
}

/**
 * Check if extension is properly configured
 */
function checkConfiguration() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (status) => {
    if (chrome.runtime.lastError || !status?.hasApiKey) {
      statusDot.classList.add('inactive');
      statusText.textContent = 'API key not configured';
    } else {
      statusDot.classList.remove('inactive');
      statusText.textContent = `Ready to enhance text (${status.model})`;
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
