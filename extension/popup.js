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

/**
 * Current store dropdown for users at more than one store. Shared with the settings page and the
 * Enhance/Reply window, and remembered.
 */
function showStorePicker(user, currentStoreId) {
  const stores = (user?.rooftops || []).filter((r) => r.active !== false);
  $('storePicker').hidden = stores.length < 2;
  if (stores.length < 2) {
    return;
  }
  const current = stores.some((s) => s.id === currentStoreId) ? currentStoreId : null;
  const select = $('currentStore');
  select.replaceChildren(
    new Option(current === null ? 'Choose your store' : 'Not sure', ''),
    ...stores.map((s) => new Option(s.name, String(s.id)))
  );
  select.value = current === null ? '' : String(current);
}

function showUsage(usage) {
  if (!usage) {
    return;
  }
  const cost = usage.cost_usd || 0;
  $('monthRequests').textContent = (usage.requests || 0).toLocaleString();
  $('monthCost').textContent = `$${cost.toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;
}

let currentStoreId = null; // Latest Current store choice, so a slow account refresh can't undo a change

async function init() {
  $('versionText').textContent = `Version ${chrome.runtime.getManifest().version}`;
  $('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('editShortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('currentStore').addEventListener('change', (e) => {
    const rooftopId = e.target.value ? Number(e.target.value) : null;
    currentStoreId = rooftopId;
    chrome.runtime.sendMessage({ action: 'setLastStore', rooftopId });
    e.target.options[0].text = rooftopId === null ? 'Choose your store' : 'Not sure';
  });

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
  currentStoreId = status.lastStoreId;
  showStorePicker(status.user, currentStoreId);
  try {
    const account = await send('getAccount');
    if (account.user.mustChangePassword) {
      setStatus(false, 'Choose a new password in Settings');
      return;
    }
    const stores = (account.user.rooftops || []).filter((r) => r.active !== false);
    const storeLabel = stores.length === 1 ? ` · ${stores[0].name}` : '';
    setStatus(true, `${account.user.name || account.user.email}${storeLabel}`);
    showStorePicker(account.user, currentStoreId);
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
