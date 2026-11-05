/**
 * Settings page for AAI CRM Extension: sign in, account details, password, server URL.
 * All server calls go through the background worker, which holds the session token.
 */

const $ = (id) => document.getElementById(id);

/**
 * Send an action to the background worker. Resolves with its data or rejects with its error.
 */
function send(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        const error = new Error(response?.error || 'Something went wrong');
        error.code = response?.code;
        reject(error);
      } else {
        resolve(response.data);
      }
    });
  });
}

function showStatus(id, message, type = 'success') {
  const el = $(id);
  el.textContent = message;
  el.className = `status-box ${type}`;
  el.style.display = message ? 'block' : 'none';
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.innerHTML = `<span class="spinner"></span>${label}`;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}

function formatCost(cost) {
  return `$${Number(cost || 0).toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;
}

/* ---------- views ---------- */

function showSignedOut(message) {
  $('loading').hidden = true;
  $('accountSection').hidden = true;
  $('signInSection').hidden = false;
  if (message) {
    showStatus('signInStatus', message, 'warning');
  }
  $('email').focus();
}

function showAccount(account) {
  const { user, model, usageThisMonth } = account;
  $('loading').hidden = true;
  $('signInSection').hidden = true;
  $('accountSection').hidden = false;

  $('accountName').textContent = user.name || '—';
  $('accountEmail').textContent = user.email;
  $('usernameHint').value = user.email;
  $('accountRooftop').textContent = user.rooftop?.name || (user.role === 'admin' ? 'All (administrator)' : '—');
  $('accountModel').textContent = model?.label || '—';
  $('usageRequests').textContent = (usageThisMonth?.requests || 0).toLocaleString();
  $('usageCost').textContent = formatCost(usageThisMonth?.cost_usd);

  $('mustChangeNotice').hidden = !user.mustChangePassword;
  $('usageSection').hidden = user.mustChangePassword;
  $('currentPassword').previousElementSibling.textContent = user.mustChangePassword
    ? 'Temporary password'
    : 'Current password';
  if (user.mustChangePassword) {
    $('currentPassword').focus();
  }
}

async function refresh() {
  const status = await send('getStatus');
  if (!status.signedIn) {
    showSignedOut();
    return;
  }
  try {
    showAccount(await send('getAccount'));
  } catch (error) {
    if (error.code === 'signed_out' || error.code === 'disabled') {
      showSignedOut(error.message);
    } else if (status.user) {
      // Offline or server trouble: show what we last knew
      showAccount({ user: status.user });
      showStatus('passwordStatus', `Couldn't refresh your account: ${error.message}`, 'warning');
    } else {
      showSignedOut(error.message);
    }
  }
}

/* ---------- actions ---------- */

async function handleSignIn(event) {
  event.preventDefault();
  const button = $('signInBtn');
  showStatus('signInStatus', '');
  setBusy(button, true, 'Signing in…');
  try {
    const account = await send('signIn', { email: $('email').value.trim(), password: $('password').value });
    $('password').value = '';
    showAccount(account);
  } catch (error) {
    showStatus('signInStatus', error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function handleSignOut() {
  await send('signOut').catch(() => {});
  showSignedOut();
}

async function handleChangePassword(event) {
  event.preventDefault();
  const newPassword = $('newPassword').value;
  if (newPassword !== $('confirmPassword').value) {
    showStatus('passwordStatus', 'The new passwords don\'t match', 'error');
    return;
  }

  const button = $('changePasswordBtn');
  setBusy(button, true, 'Saving…');
  try {
    const account = await send('changePassword', { currentPassword: $('currentPassword').value, newPassword });
    $('passwordSection').reset();
    showAccount(account);
    showStatus('passwordStatus', 'Password changed. You\'re all set.', 'success');
  } catch (error) {
    showStatus('passwordStatus', error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function saveServerUrl(url) {
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new Error();
      }
    } catch {
      showStatus('serverStatus', 'Enter a full URL, e.g. https://example.com', 'error');
      return;
    }
  }
  const saved = await send('setServerUrl', { url });
  $('serverUrl').value = saved;
  showStatus('serverStatus', `Using ${saved}`, 'success');
  showSignedOut();
}

/* ---------- init ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  $('versionText').textContent = `Version ${chrome.runtime.getManifest().version}`;

  $('signInSection').addEventListener('submit', handleSignIn);
  $('signOutBtn').addEventListener('click', handleSignOut);
  $('passwordSection').addEventListener('submit', handleChangePassword);
  $('saveServerUrl').addEventListener('click', () => saveServerUrl($('serverUrl').value.trim()));
  $('resetServerUrl').addEventListener('click', () => saveServerUrl(''));

  $('serverUrl').value = await send('getServerUrl').catch(() => AAI_DEFAULT_SERVER_URL);
  await refresh().catch((error) => showSignedOut(error.message));
});
