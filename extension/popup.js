/**
 * Popup Script for AAI CRM Extension
 * Shows sign-in status, this month's usage and keyboard shortcuts
 */

const $ = (id) => document.getElementById(id);

function send(action) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        reject(new Error(chrome.runtime.lastError?.message || response?.error || 'Unavailable'));
      } else {
        resolve(response.data);
      }
    });
  });
}

function setStatus(ok, text) {
  $('statusDot').classList.toggle('inactive', !ok);
  $('statusText').textContent = text;
}

function showUsage(usage) {
  if (!usage) {
    return;
  }
  const cost = usage.cost_usd || 0;
  $('monthRequests').textContent = (usage.requests || 0).toLocaleString();
  $('monthCost').textContent = `$${cost.toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;
}

async function init() {
  $('versionText').textContent = `Version ${chrome.runtime.getManifest().version}`;
  $('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('editShortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  const status = await send('getStatus').catch(() => null);
  if (status?.shortcuts) {
    $('shortcutEnhance').textContent = status.shortcuts.enhance || 'Not set';
    $('shortcutResponse').textContent = status.shortcuts.response || 'Not set';
  }

  if (!status?.signedIn) {
    setStatus(false, 'Not signed in');
    $('openSettings').textContent = 'Sign In';
    return;
  }

  setStatus(true, `Signed in as ${status.user?.name || status.user?.email || 'you'}`);
  try {
    const account = await send('getAccount');
    if (account.user.mustChangePassword) {
      setStatus(false, 'Choose a new password in Settings');
      return;
    }
    setStatus(true, `${account.user.name || account.user.email}${account.user.rooftop ? ` · ${account.user.rooftop.name}` : ''}`);
    showUsage(account.usageThisMonth);
  } catch (error) {
    // Offline or signed out on the server: keep the local status, mention the problem
    const fresh = await send('getStatus').catch(() => null);
    if (!fresh?.signedIn) {
      setStatus(false, 'Signed out. Please sign in again');
      $('openSettings').textContent = 'Sign In';
    } else {
      setStatus(true, `${$('statusText').textContent} (offline)`);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
