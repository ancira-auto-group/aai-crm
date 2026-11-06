/**
 * Background Service Worker for AAI CRM Extension
 * Signs users in to the AAI for CRM server and relays generation requests to it.
 * The OpenAI key, model choice, prompts and usage tracking all live on the server.
 */

importScripts('config.js');

const GENERATE_PORT_NAME = 'aai-generate';
const REQUEST_TIMEOUT_MS = 15000; // Max wait for a response, and between streamed chunks
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

// Storage keys from v2 (per-user OpenAI keys, local prompts and usage). Removed on upgrade.
const LEGACY_LOCAL_KEYS = [
  'openai_api_key', 'remember_api_key', 'model', 'usage_stats',
  'enhance_prompt', 'enhance_url', 'enhance_last_updated', 'enhance_fetch_error',
  'response_prompt', 'response_url', 'response_last_updated', 'response_fetch_error'
];
const LEGACY_ALARMS = ['dailyEnhancePromptRefresh', 'dailyResponsePromptRefresh'];

/**
 * Clean up v2 settings on install/update. Old API keys must not linger on disk.
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('AAI CRM Extension: Installed/Updated', details.reason);
  chrome.storage.local.remove(LEGACY_LOCAL_KEYS);
  chrome.storage.session.remove(['openai_api_key']);
  LEGACY_ALARMS.forEach((name) => chrome.alarms?.clear(name));
});

/* ---------- account state ---------- */

async function getServerUrl() {
  const { server_url: url } = await chrome.storage.local.get(['server_url']);
  return (url || AAI_DEFAULT_SERVER_URL).replace(/\/+$/, '');
}

async function getAuth() {
  const { auth_token: token, account } = await chrome.storage.local.get(['auth_token', 'account']);
  return { token: token || null, account: account || null };
}

async function clearAuth() {
  await chrome.storage.local.remove(['auth_token', 'account', 'last_store_id']);
}

/**
 * Error from the server, with its machine-readable code (e.g. 'signed_out')
 */
class ServerError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Call the server. Adds the session token and extension version; throws ServerError on failure.
 * Returns the raw Response when stream: true, otherwise parsed JSON.
 */
async function callServer(path, { method = 'GET', body, signal, stream = false } = {}) {
  const { token } = await getAuth();
  const headers = { 'X-AAI-Extension-Version': EXTENSION_VERSION };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${await getServerUrl()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw error;
    }
    throw new ServerError('Can\'t reach the AAI server. Check your internet connection and try again.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new ServerError(data.error || `Server error (${response.status})`, {
      status: response.status,
      code: data.code
    });
    if (error.code === 'signed_out' || error.code === 'disabled') {
      await clearAuth();
    }
    throw error;
  }

  return stream ? response : response.json();
}

async function signIn(email, password) {
  const data = await callServer('/api/auth/login', {
    method: 'POST',
    body: { email, password, client: 'extension' }
  });
  await chrome.storage.local.set({ auth_token: data.token, account: { user: data.user } });
  return getAccount();
}

async function signOut() {
  try {
    await callServer('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.warn('AAI CRM Extension: Sign-out request failed; clearing local session anyway', error);
  }
  await clearAuth();
}

/**
 * Fetch the signed-in user, their model and this month's usage, and cache it
 */
async function getAccount() {
  const data = await callServer('/api/me');
  await chrome.storage.local.set({ account: { ...data, fetchedAt: Date.now() } });
  return data;
}

// Rooftop assignments change rarely; refresh the cached account in the background when it's older than this
const ACCOUNT_REFRESH_MS = 10 * 60 * 1000;

// Ignore a dealership reported by the main VinSolutions window longer ago than this
const DEALERSHIP_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function changePassword(currentPassword, newPassword) {
  await callServer('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
  return getAccount();
}

/**
 * Current keyboard shortcuts for the two actions (empty string if unassigned)
 */
async function getShortcuts() {
  const commands = await chrome.commands.getAll();
  const shortcutFor = (name) => commands.find(c => c.name === name)?.shortcut || '';
  return {
    enhance: shortcutFor('enhance-selection'),
    response: shortcutFor('reply-to-selection')
  };
}

/**
 * Local status, no network: is someone signed in, and who (as of the last server check)
 */
async function getStatus() {
  const [{ token, account }, shortcuts, { last_store_id: lastStoreId }, { crm_dealership: dealership }] = await Promise.all([
    getAuth(), getShortcuts(), chrome.storage.local.get(['last_store_id']), chrome.storage.session.get(['crm_dealership'])
  ]);
  if (token && Date.now() - (account?.fetchedAt || 0) > ACCOUNT_REFRESH_MS) {
    // Picks up rooftop changes made by an admin; the next modal sees them
    getAccount().catch(() => {});
  }
  return {
    signedIn: !!token,
    mustChangePassword: !!account?.user?.mustChangePassword,
    user: account?.user || null,
    lastStoreId: lastStoreId ?? null,
    // Dealership the main VinSolutions window last showed (this browser session only)
    reportedDealership: dealership && Date.now() - dealership.at < DEALERSHIP_MAX_AGE_MS ? dealership.name : null,
    shortcuts
  };
}

/* ---------- messages ---------- */

/**
 * Keyboard shortcuts: ask the page's content script to act on the current selection
 */
chrome.commands.onCommand.addListener((command, tab) => {
  const mode = { 'enhance-selection': 'enhance', 'reply-to-selection': 'response' }[command];
  if (!mode || !tab?.id) {
    return;
  }
  // Fails harmlessly on pages where the content script doesn't run
  chrome.tabs.sendMessage(tab.id, { action: 'shortcut', mode }, { frameId: 0 }).catch(() => {});
});

// The only actions content scripts (running inside CRM pages) may trigger
const CONTENT_SCRIPT_ACTIONS = new Set(['getStatus', 'openOptions', 'setLastStore', 'reportDealership']);

const HANDLERS = {
  getStatus: () => getStatus(),
  getAccount: () => getAccount(),
  signIn: (request) => signIn(request.email, request.password),
  signOut: () => signOut(),
  changePassword: (request) => changePassword(request.currentPassword, request.newPassword),
  openOptions: () => chrome.runtime.openOptionsPage(),
  // Remember a multi-store user's last store choice (null = "Not sure")
  // The main VinSolutions window reports the dealership in its header; pop-ups use the latest one
  reportDealership: (request) => {
    const name = typeof request.name === 'string' ? request.name.trim().slice(0, 150) : '';
    return name ? chrome.storage.session.set({ crm_dealership: { name, at: Date.now() } }) : undefined;
  },
  setLastStore: (request) => chrome.storage.local.set({
    last_store_id: Number.isInteger(request.rooftopId) ? request.rooftopId : null
  }),
  getServerUrl: () => getServerUrl(),
  setServerUrl: async (request) => {
    // Changing servers ends the current session
    await signOut();
    if (request.url) {
      await chrome.storage.local.set({ server_url: request.url });
    } else {
      await chrome.storage.local.remove(['server_url']);
    }
    return getServerUrl();
  }
};

/**
 * One-shot messages from the content script, popup and options page.
 * Replies with { ok: true, data } or { ok: false, error, code }.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = HANDLERS[request.action];
  if (!handler) {
    return false;
  }
  // Only the extension's own pages may sign in/out or change settings; content scripts can read status
  const fromContentScript = !!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''));
  if (fromContentScript && !CONTENT_SCRIPT_ACTIONS.has(request.action)) {
    sendResponse({ ok: false, error: 'Not allowed' });
    return false;
  }

  Promise.resolve(handler(request))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message, code: error.code }));
  return true;
});

/* ---------- streaming generation ---------- */

/**
 * Handle streaming generation requests from the content script.
 * Protocol (port messages to the content script):
 *   { type: 'delta', text }  - next chunk of generated text
 *   { type: 'done', text }   - generation finished
 *   { type: 'error', error, code } - generation failed
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
      const text = await streamGeneration(request, controller, (delta) => post({ type: 'delta', text: delta }));
      post({ type: 'done', text });
    } catch (error) {
      if (disconnected) {
        return; // Cancelled by the user, nobody to report to
      }
      console.error('AAI CRM Extension: Error generating text', error);
      post({ type: 'error', error: friendlyError(error), code: error.code });
    }
    // The content script disconnects once it has received 'done' or 'error'
  });
});

function friendlyError(error) {
  if (error.code === 'signed_out') {
    return 'You\'re signed out. Open the extension settings to sign in';
  }
  if (error.code === 'password_change_required') {
    return 'Please set a new password in the extension settings first';
  }
  return error.message.replace(/\.$/, '');
}

/**
 * POST /api/generate and relay its server-sent events. Resolves with the final text.
 */
async function streamGeneration(request, controller, onDelta) {
  const { token } = await getAuth();
  if (!token) {
    throw new ServerError('Not signed in', { code: 'signed_out' });
  }

  let timedOut = false;
  let timeoutId = null;
  const resetTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
  };

  try {
    resetTimeout();
    const response = await callServer('/api/generate', {
      method: 'POST',
      body: {
        mode: request.mode,
        text: request.text,
        additionalContext: request.additionalContext || '',
        rooftopId: Number.isInteger(request.rooftopId) ? request.rooftopId : null
      },
      signal: controller.signal,
      stream: true
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      resetTimeout();
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop(); // Keep any partial event for the next chunk

      for (const event of events) {
        const line = event.split('\n').find((l) => l.startsWith('data:'));
        if (!line) {
          continue;
        }
        const message = JSON.parse(line.slice(5));
        if (message.type === 'delta') {
          onDelta(message.text);
        } else if (message.type === 'done') {
          if (message.truncated) {
            console.warn('AAI CRM Extension: Response hit the length limit and may be cut off');
          }
          return message.text;
        } else if (message.type === 'error') {
          throw new ServerError(message.error, { code: message.code });
        }
      }
    }

    throw new ServerError('The connection to the AAI server ended unexpectedly. Please try again.');

  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new ServerError(timedOut ? 'Request timed out. Please try again.' : 'Request cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

console.log('AAI CRM Extension: Background service worker initialized');
