/**
 * Popup Script for AAI CRM Extension
 * Handles popup UI interactions
 */

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const openSettingsBtn = document.getElementById('openSettings');
const editShortcutsBtn = document.getElementById('editShortcuts');
const monthRequests = document.getElementById('monthRequests');
const monthCost = document.getElementById('monthCost');
const shortcutEnhance = document.getElementById('shortcutEnhance');
const shortcutResponse = document.getElementById('shortcutResponse');
const versionText = document.getElementById('versionText');

/**
 * Initialize popup
 */
function init() {
  versionText.textContent = `Version ${chrome.runtime.getManifest().version}`;
  checkConfiguration();
  loadUsage();
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

    if (status?.shortcuts) {
      shortcutEnhance.textContent = status.shortcuts.enhance || 'Not set';
      shortcutResponse.textContent = status.shortcuts.response || 'Not set';
    }
  });
}

/**
 * Show this month's requests and estimated cost
 */
function loadUsage() {
  chrome.storage.local.get(['usage_stats'], (result) => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const bucket = result.usage_stats?.[month];
    if (!bucket) {
      return;
    }
    monthRequests.textContent = bucket.requests.toLocaleString();
    monthCost.textContent = `$${bucket.cost_usd.toFixed(bucket.cost_usd < 0.01 ? 4 : 2)}`;
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  editShortcutsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
