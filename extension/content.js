/**
 * Content Script for AAI CRM Extension
 * Handles text selection detection, floating action buttons, the result modal,
 * and inserting the result back into the CRM.
 */

// Constants
const MIN_SELECTION_LENGTH = 10;
const SELECTION_DEBOUNCE_MS = 300;
const BUTTON_OFFSET_PX = 10;
const FRAME_SCAN_INTERVAL_MS = 1500;
const OWN_UI_SELECTOR = '.aai-crm-floating-bar, .aai-crm-modal, .aai-crm-toast';
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', '']);

// One-click tweaks shown under the result
const TONE_CHIPS = [
  { label: 'Shorter', instruction: 'Make it shorter and more concise.' },
  { label: 'More formal', instruction: 'Use a more formal, professional tone.' },
  { label: 'Friendlier', instruction: 'Use a warmer, friendlier tone.' },
  { label: 'Add call-to-action', instruction: 'End with a clear, friendly call to action, such as scheduling a visit, a test drive, or a call back.' },
  { label: 'Spanish', instruction: 'Write it in Spanish.' }
];

// SMS encoding (GSM-7): basic characters count as 1, extension characters as 2
const GSM7_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€\f';

// State
let selectionTimeout = null;
let floatingBar = null;
let modal = null;
let currentSelection = '';
let currentMode = 'enhance'; // 'enhance' or 'response'
let selectionContext = null; // Where the selected text lives, captured when an action is chosen
let lastEditable = null; // Last text field the user focused: { el, range }
let restoreFocusEl = null; // Element to refocus if the modal is dismissed
let generationPort = null; // Open streaming connection to the background worker, if any
let versions = []; // Generated results for this modal: [{ text, label }]
let versionIndex = -1;
let shortcuts = { enhance: '', response: '' };
const watchedDocs = new WeakSet();

// SVG Icons
const ENHANCE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
  <circle cx="12" cy="12" r="3"/>
</svg>
`;

const RESPONSE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 14 4 9 9 4"></polyline>
  <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
</svg>
`;

// PII Detection Patterns
const PII_PATTERNS = {
  phone: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g
};

/**
 * Detect and redact PII from text
 * @param {string} text - Original text
 * @returns {object} - { redactedText, hasPII, piiTypes }
 */
function detectAndRedactPII(text) {
  let redactedText = text;
  let hasPII = false;
  const piiTypes = [];

  // Check and redact phone numbers
  if (PII_PATTERNS.phone.test(text)) {
    redactedText = redactedText.replace(PII_PATTERNS.phone, '[PHONE]');
    hasPII = true;
    piiTypes.push('phone number');
  }

  // Check and redact email addresses
  if (PII_PATTERNS.email.test(text)) {
    redactedText = redactedText.replace(PII_PATTERNS.email, '[EMAIL]');
    hasPII = true;
    piiTypes.push('email address');
  }

  // Check and redact SSNs
  if (PII_PATTERNS.ssn.test(text)) {
    redactedText = redactedText.replace(PII_PATTERNS.ssn, '[SSN]');
    hasPII = true;
    piiTypes.push('social security number');
  }

  return { redactedText, hasPII, piiTypes };
}

/**
 * Initialize the extension
 */
function init() {
  watchDocument(document);
  scanFrames();
  setInterval(scanFrames, FRAME_SCAN_INTERVAL_MS);

  // Modal keyboard handling (Esc, Ctrl+Enter, focus trap)
  document.addEventListener('keydown', handleModalKeydown, true);

  // Keyboard shortcuts arrive from the background worker (chrome.commands)
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'shortcut') {
      handleShortcut(request.mode);
    }
  });

  loadShortcuts();
  console.log('AAI CRM Extension: Content script initialized');
}

/**
 * Load the user's keyboard shortcuts, shown in button tooltips
 */
function loadShortcuts() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (!chrome.runtime.lastError && response?.data?.shortcuts) {
      shortcuts = response.data.shortcuts;
    }
  });
}

/**
 * Listen for selections and focus changes in a document (the page or a same-origin iframe)
 */
function watchDocument(doc) {
  if (watchedDocs.has(doc)) {
    return;
  }
  watchedDocs.add(doc);
  doc.addEventListener('mouseup', handleMouseUp);
  doc.addEventListener('selectionchange', handleSelectionChange);
  doc.addEventListener('focusin', handleFocusIn, true);
  doc.addEventListener('focusout', handleFocusOut, true);
}

/**
 * All documents we can reach: the page plus same-origin iframes (recursively)
 */
function accessibleDocuments(root = document, docs = []) {
  docs.push(root);
  for (const iframe of root.querySelectorAll('iframe')) {
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.documentElement) {
        accessibleDocuments(doc, docs);
      }
    } catch (e) {
      // Cross-origin iframe, skip it
    }
  }
  return docs;
}

/**
 * Start watching any iframes that appeared or navigated since the last scan
 */
function scanFrames() {
  for (const doc of accessibleDocuments()) {
    watchDocument(doc);
  }
}

/**
 * Whether an element is a writable text field (input, textarea, or rich-text editor)
 */
function isEditableElement(el) {
  if (!el || !el.isConnected || el.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase()))) {
    return !el.disabled && !el.readOnly;
  }
  return el.isContentEditable;
}

function isTextField(el) {
  return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
}

/**
 * For rich-text editors, the outermost contentEditable element
 */
function editableRoot(el) {
  if (isTextField(el)) {
    return el;
  }
  let root = el;
  while (root.parentElement && root.parentElement.isContentEditable) {
    root = root.parentElement;
  }
  return root;
}

/**
 * Remember the last text field the user focused, so replies go where they were typing
 */
function handleFocusIn(event) {
  const el = event.target;
  if (!el || el.nodeType !== Node.ELEMENT_NODE || el.closest(OWN_UI_SELECTOR)) {
    return;
  }
  if (isEditableElement(el)) {
    const root = editableRoot(el);
    if (lastEditable?.el !== root) {
      lastEditable = { el: root, range: null };
    }
  }
}

/**
 * Save the caret position of a rich-text editor when it loses focus
 */
function handleFocusOut(event) {
  if (!lastEditable || !lastEditable.el.isContentEditable || !lastEditable.el.contains(event.target)) {
    return;
  }
  const selection = lastEditable.el.ownerDocument.getSelection();
  if (selection && selection.rangeCount > 0 && lastEditable.el.contains(selection.anchorNode)) {
    lastEditable.range = selection.getRangeAt(0).cloneRange();
  }
}

/**
 * Handle mouse up event with debouncing
 */
function handleMouseUp(event) {
  clearTimeout(selectionTimeout);

  // Clicks on our own buttons/modals aren't new selections on the page
  if (event.target instanceof Element && event.target.closest(OWN_UI_SELECTOR)) {
    return;
  }

  selectionTimeout = setTimeout(() => {
    checkSelection();
  }, SELECTION_DEBOUNCE_MS);
}

/**
 * Get the active selection and its document context
 */
function getActiveSelection() {
  // Check main document first
  let selection = window.getSelection();
  let doc = document;
  let iframe = null;

  // Check if main document selection has a valid bounding rect
  let hasValidRect = false;
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    // A valid rect should have non-zero dimensions
    hasValidRect = rect.width > 0 || rect.height > 0;
  }

  // If main document doesn't have a valid selection rect, check iframes
  if (!hasValidRect) {
    const iframes = document.querySelectorAll('iframe');
    for (const iframeEl of iframes) {
      try {
        const iframeDoc = iframeEl.contentDocument || iframeEl.contentWindow.document;

        if (getSelectedText(iframeEl.contentWindow.getSelection(), iframeDoc).length > 0) {
          selection = iframeEl.contentWindow.getSelection();
          doc = iframeDoc;
          iframe = iframeEl;
          break;
        }
      } catch (e) {
        // Cross-origin iframe, skip it
      }
    }
  }

  return { selection, doc, iframe };
}

/**
 * Selected text, including text selected inside an input or textarea
 */
function getSelectedText(selection, doc) {
  const active = doc.activeElement;
  if (active && isTextField(active) && typeof active.selectionStart === 'number' && active.selectionStart !== active.selectionEnd) {
    return active.value.substring(active.selectionStart, active.selectionEnd).trim();
  }
  return selection ? selection.toString().trim() : '';
}

/**
 * Capture where the selected text lives, so Enhance can replace it in place
 */
function captureSelectionContext(selection, doc, text) {
  const context = { doc, text, editable: null, start: null, end: null, range: null };
  const active = doc.activeElement;

  if (active && isTextField(active) && isEditableElement(active) && active.selectionStart !== active.selectionEnd) {
    context.editable = active;
    context.start = active.selectionStart;
    context.end = active.selectionEnd;
  } else if (selection && selection.rangeCount > 0) {
    context.range = selection.getRangeAt(0).cloneRange();
    const node = context.range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (el && el.isContentEditable) {
      context.editable = editableRoot(el);
    }
  }

  return context;
}

/**
 * Handle selection change (cleanup)
 */
function handleSelectionChange() {
  const { selection, doc } = getActiveSelection();
  if (getSelectedText(selection, doc).length === 0) {
    removeFloatingButton();
  }
}

/**
 * Check if there's a valid text selection
 */
function checkSelection() {
  // Don't offer buttons while a modal is open
  if (isModalOpen()) {
    removeFloatingButton();
    return;
  }

  const { selection, doc, iframe } = getActiveSelection();
  const text = getSelectedText(selection, doc);

  if (text.length >= MIN_SELECTION_LENGTH) {
    showFloatingButton(selection, doc, iframe);
  } else {
    removeFloatingButton();
  }
}

/**
 * Keyboard shortcut: act on the current selection without the floating buttons
 */
function handleShortcut(mode) {
  if (isModalOpen()) {
    return;
  }

  const { selection, doc } = getActiveSelection();
  const text = getSelectedText(selection, doc);

  if (text.length < MIN_SELECTION_LENGTH) {
    showToast(`Select at least ${MIN_SELECTION_LENGTH} characters of text first`, true);
    return;
  }

  startAction(mode, selection, doc);
}

/**
 * Whether one of our modals (main or setup) is currently open
 */
function isModalOpen() {
  return !!document.querySelector('.aai-crm-modal');
}

/**
 * Show the floating action buttons near the selection
 */
function showFloatingButton(selection, doc, iframe) {
  removeFloatingButton();

  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  let rect = range.getBoundingClientRect();

  // For INPUT/TEXTAREA, the range bounding rect is often zero, so use the element's rect
  if (rect.width === 0 && rect.height === 0) {
    const activeEl = doc.activeElement;
    if (activeEl && isTextField(activeEl)) {
      rect = activeEl.getBoundingClientRect();
    }
  }

  // If selection is in an iframe, adjust coordinates to the top-level viewport
  if (iframe) {
    const iframeRect = iframe.getBoundingClientRect();
    rect = {
      top: rect.top + iframeRect.top,
      bottom: rect.bottom + iframeRect.top,
      left: rect.left + iframeRect.left,
      right: rect.right + iframeRect.left
    };
  }

  // Create the button bar
  floatingBar = document.createElement('div');
  floatingBar.className = 'aai-crm-floating-bar';

  const buttons = [
    { mode: 'enhance', label: 'Enhance', title: 'Enhance selected text', icon: ENHANCE_ICON_SVG },
    { mode: 'response', label: 'Reply', title: 'Suggest a response to the selected message', icon: RESPONSE_ICON_SVG }
  ];

  for (const { mode, label, title, icon } of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `aai-crm-floating-button aai-crm-${mode === 'enhance' ? 'enhance' : 'response'}-btn`;
    button.innerHTML = icon;
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    button.appendChild(labelEl);
    button.title = shortcuts[mode] ? `${title} (${shortcuts[mode]})` : title;
    button.setAttribute('aria-label', button.title);

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const active = getActiveSelection();
      startAction(mode, active.selection, active.doc);
    });

    floatingBar.appendChild(button);
  }

  // Keep the page's focus and selection when the buttons are pressed
  floatingBar.addEventListener('mousedown', (e) => e.preventDefault());

  document.body.appendChild(floatingBar);

  // Position just above the selection, or below it if too close to the top
  const barWidth = floatingBar.offsetWidth;
  const barHeight = floatingBar.offsetHeight;
  let top = rect.top - barHeight - 5;
  let left = rect.left;

  if (top < 10) {
    top = rect.bottom + BUTTON_OFFSET_PX;
  }
  if (left + barWidth > window.innerWidth - 10) {
    left = window.innerWidth - barWidth - 10;
  }
  if (left < 10) {
    left = 10;
  }

  floatingBar.style.top = `${top}px`;
  floatingBar.style.left = `${left}px`;

  // Fade in animation
  setTimeout(() => {
    floatingBar?.classList.add('aai-crm-visible');
  }, 10);
}

/**
 * Remove the floating buttons
 */
function removeFloatingButton() {
  if (floatingBar) {
    floatingBar.remove();
    floatingBar = null;
  }
}

/**
 * Deepest focused element, looking inside same-origin iframes
 */
function deepActiveElement() {
  let el = document.activeElement;
  try {
    while (el && el.tagName === 'IFRAME' && el.contentDocument?.activeElement) {
      el = el.contentDocument.activeElement;
    }
  } catch (e) {
    // Cross-origin iframe
  }
  return el;
}

/**
 * Capture the selection and open the modal for the chosen action
 */
function startAction(mode, selection, doc) {
  const text = getSelectedText(selection, doc);
  if (text.length < MIN_SELECTION_LENGTH) {
    return;
  }
  currentSelection = text;
  selectionContext = captureSelectionContext(selection, doc, text);
  restoreFocusEl = deepActiveElement();
  openModal(mode);
}

/**
 * Open the modal (enhance or response mode)
 */
function openModal(mode = 'enhance') {
  clearTimeout(selectionTimeout);
  removeFloatingButton();
  currentMode = mode;

  // Check that someone is signed in (the session token stays in the background worker)
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    const status = response?.data;
    if (chrome.runtime.lastError || !status?.signedIn || status.mustChangePassword) {
      showSetupPrompt(status?.signedIn);
      return;
    }
    if (status.shortcuts) {
      shortcuts = status.shortcuts;
    }
    createModal(mode);
  });
}

/**
 * Ask the user to sign in (or finish setting their password) in the extension settings
 */
function showSetupPrompt(signedIn = false) {
  const message = signedIn
    ? 'Please choose a new password in the extension settings before using AAI for CRM.'
    : 'Sign in with the account your administrator gave you to start using AAI for CRM.';
  const setupModal = document.createElement('div');
  setupModal.className = 'aai-crm-modal';
  setupModal.innerHTML = `
    <div class="aai-crm-modal-content aai-crm-setup" role="dialog" aria-modal="true" aria-labelledby="aai-crm-setup-title" tabindex="-1">
      <div class="aai-crm-modal-header">
        <h2 id="aai-crm-setup-title">${signedIn ? 'Finish setting up' : 'Sign in required'}</h2>
        <button class="aai-crm-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="aai-crm-modal-body">
        <p>${message}</p>
        <button class="aai-crm-primary-btn" id="aai-crm-open-settings">${signedIn ? 'Open Settings' : 'Sign In'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(setupModal);

  const close = () => setupModal.remove();
  setupModal.querySelector('.aai-crm-close-btn').addEventListener('click', close);
  setupModal.querySelector('#aai-crm-open-settings').addEventListener('click', () => {
    // openOptionsPage isn't available to content scripts, so ask the background worker
    chrome.runtime.sendMessage({ action: 'openOptions' });
    close();
  });
  setupModal.addEventListener('click', (e) => {
    if (e.target === setupModal) {
      close();
    }
  });

  setupModal.querySelector('#aai-crm-open-settings').focus();
}

/**
 * Create and show the main modal
 */
function createModal(mode = 'enhance') {
  const isEnhanceMode = mode === 'enhance';
  const title = isEnhanceMode ? 'Enhance Your Text' : 'Suggest a Response';
  const resultLabel = isEnhanceMode ? 'Enhanced Text:' : 'Suggested Response:';
  const loadingText = isEnhanceMode ? 'Enhancing your text...' : 'Generating response...';
  const originalLabel = isEnhanceMode ? 'Original Text:' : 'Customer Message:';
  const isMac = /Mac/i.test(navigator.platform);

  versions = [];
  versionIndex = -1;

  modal = document.createElement('div');
  modal.className = 'aai-crm-modal';
  modal.innerHTML = `
    <div class="aai-crm-modal-content" role="dialog" aria-modal="true" aria-labelledby="aai-crm-modal-title" tabindex="-1">
      <div class="aai-crm-modal-header">
        <h2 id="aai-crm-modal-title">${title}</h2>
        <button class="aai-crm-close-btn" aria-label="Close (Esc)" title="Close (Esc)">&times;</button>
      </div>
      <div class="aai-crm-modal-body">
        <div class="aai-crm-section">
          <label>${originalLabel}</label>
          <div class="aai-crm-original-text">${escapeHtml(currentSelection)}</div>
        </div>
        <div class="aai-crm-section">
          <div class="aai-crm-result-header">
            <label for="aai-crm-result">${resultLabel}</label>
            <div class="aai-crm-version-nav" style="display: none;">
              <button type="button" class="aai-crm-version-btn aai-crm-version-prev" aria-label="Previous version">&#8249;</button>
              <span class="aai-crm-version-label" aria-live="polite"></span>
              <button type="button" class="aai-crm-version-btn aai-crm-version-next" aria-label="Next version">&#8250;</button>
            </div>
          </div>
          <div class="aai-crm-loading" role="status">
            <div class="aai-crm-spinner"></div>
            <p>${loadingText}</p>
          </div>
          <textarea id="aai-crm-result" class="aai-crm-enhanced-text" style="display: none;" rows="8"></textarea>
          <div class="aai-crm-counter" style="display: none;" aria-live="polite"></div>
          <div class="aai-crm-error" role="alert" style="display: none;"></div>
          <div class="aai-crm-chips" style="display: none;" role="group" aria-label="Quick tweaks"></div>
        </div>
        <div class="aai-crm-flair-section" style="display: none;">
          <label for="aai-crm-flair-input">Additional Context:</label>
          <input type="text" id="aai-crm-flair-input" class="aai-crm-flair-input" placeholder="Add specific instructions or context, then press Enter...">
          <button class="aai-crm-secondary-btn aai-crm-flair-submit">Regenerate with Context</button>
        </div>
      </div>
      <div class="aai-crm-modal-footer">
        <button class="aai-crm-primary-btn" id="aai-crm-copy-close" style="display: none;" title="Insert into the CRM and copy to clipboard (${isMac ? '⌘' : 'Ctrl'}+Enter)">Copy & Close</button>
        <button class="aai-crm-secondary-btn" id="aai-crm-mix-it-up" style="display: none;">Mix It Up</button>
        <button class="aai-crm-secondary-btn" id="aai-crm-add-flair" style="display: none;">Add Some Flair</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  modal.querySelector('.aai-crm-close-btn').addEventListener('click', () => closeModal());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  const textareaEl = modal.querySelector('.aai-crm-enhanced-text');
  const flairSection = modal.querySelector('.aai-crm-flair-section');
  const flairInput = modal.querySelector('.aai-crm-flair-input');

  modal.querySelector('#aai-crm-copy-close').addEventListener('click', insertAndClose);
  modal.querySelector('#aai-crm-mix-it-up').addEventListener('click', () => generateEnhancedText('', 'Mixed up'));
  modal.querySelector('#aai-crm-add-flair').addEventListener('click', () => {
    flairSection.style.display = 'block';
    flairInput.focus();
  });

  const submitFlair = () => {
    const flair = flairInput.value.trim();
    if (flair) {
      generateEnhancedText(flair, 'Custom');
    }
  };
  modal.querySelector('.aai-crm-flair-submit').addEventListener('click', submitFlair);
  flairInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      submitFlair();
    }
  });

  // Quick tweak chips
  const chipsEl = modal.querySelector('.aai-crm-chips');
  for (const chip of TONE_CHIPS) {
    const chipBtn = document.createElement('button');
    chipBtn.type = 'button';
    chipBtn.className = 'aai-crm-chip';
    chipBtn.textContent = chip.label;
    chipBtn.addEventListener('click', () => generateEnhancedText(chip.instruction, chip.label));
    chipsEl.appendChild(chipBtn);
  }

  // Version navigation
  modal.querySelector('.aai-crm-version-prev').addEventListener('click', () => showVersion(versionIndex - 1));
  modal.querySelector('.aai-crm-version-next').addEventListener('click', () => showVersion(versionIndex + 1));

  // Keep edits with their version and the counter up to date
  textareaEl.addEventListener('input', () => {
    if (versions[versionIndex]) {
      versions[versionIndex].text = textareaEl.value;
    }
    updateCounter();
  });

  modal.querySelector('.aai-crm-modal-content').focus();

  // Initial generation
  generateEnhancedText();
}

/**
 * Show or hide the controls that act on a finished result
 */
function setResultControlsVisible(visible) {
  modal.querySelectorAll('.aai-crm-modal-footer button').forEach(btn => {
    btn.style.display = visible ? 'inline-block' : 'none';
  });
  modal.querySelector('.aai-crm-chips').style.display = visible ? 'flex' : 'none';
}

/**
 * Update the version navigation (‹ 2 / 3 ›)
 */
function updateVersionNav() {
  const nav = modal.querySelector('.aai-crm-version-nav');
  const generating = !!generationPort;

  if (versions.length < 2) {
    nav.style.display = 'none';
    return;
  }

  nav.style.display = 'flex';
  const current = versions[versionIndex];
  modal.querySelector('.aai-crm-version-label').textContent =
    `${versionIndex + 1} / ${versions.length}${current?.label ? ` · ${current.label}` : ''}`;
  modal.querySelector('.aai-crm-version-prev').disabled = generating || versionIndex <= 0;
  modal.querySelector('.aai-crm-version-next').disabled = generating || versionIndex >= versions.length - 1;
}

/**
 * Show a previously generated version
 */
function showVersion(index) {
  if (index < 0 || index >= versions.length || generationPort) {
    return;
  }
  versionIndex = index;

  const textareaEl = modal.querySelector('.aai-crm-enhanced-text');
  modal.querySelector('.aai-crm-loading').style.display = 'none';
  modal.querySelector('.aai-crm-error').style.display = 'none';
  textareaEl.style.display = 'block';
  textareaEl.readOnly = false;
  textareaEl.value = versions[index].text;

  setResultControlsVisible(true);
  updateVersionNav();
  updateCounter();
}

/**
 * SMS length info: GSM-7 messages fit 160 characters (153 per part when split);
 * any other character (emoji, curly quotes, ...) switches to 70 (67 per part).
 */
function smsInfo(text) {
  const nonGsm = new Set();
  let gsmLength = 0;

  for (const char of text) {
    if (GSM7_BASIC.includes(char)) {
      gsmLength += 1;
    } else if (GSM7_EXTENDED.includes(char)) {
      gsmLength += 2;
    } else {
      nonGsm.add(char);
    }
  }

  if (nonGsm.size === 0) {
    return { chars: text.length, segments: gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153), nonGsm: [] };
  }
  return { chars: text.length, segments: text.length <= 70 ? 1 : Math.ceil(text.length / 67), nonGsm: [...nonGsm] };
}

/**
 * Update the character / SMS counter under the result
 */
function updateCounter() {
  const counterEl = modal.querySelector('.aai-crm-counter');
  const text = modal.querySelector('.aai-crm-enhanced-text').value;

  if (!text) {
    counterEl.style.display = 'none';
    return;
  }

  const { chars, segments, nonGsm } = smsInfo(text);
  let message = `${chars} characters · ${segments} text message${segments === 1 ? '' : 's'}`;
  if (nonGsm.length > 0) {
    const examples = nonGsm.slice(0, 3).map(c => (c.trim() ? c : 'U+' + c.codePointAt(0).toString(16).toUpperCase())).join(' ');
    message += ` · special characters (${examples}) shorten each text to 70 characters`;
  }

  counterEl.textContent = message;
  counterEl.classList.toggle('aai-crm-counter-warning', segments > 1);
  counterEl.style.display = 'block';
}

/**
 * Generate enhanced text or a suggested response through the AAI server.
 * Text is streamed into the textarea as it arrives; each finished result becomes a new version.
 * @param {string} additionalContext - Extra instructions for the model
 * @param {string} label - Short name for the version (e.g. "Shorter")
 */
function generateEnhancedText(additionalContext = '', label = '') {
  const loadingEl = modal.querySelector('.aai-crm-loading');
  const textareaEl = modal.querySelector('.aai-crm-enhanced-text');
  const errorEl = modal.querySelector('.aai-crm-error');

  // Cancel any generation still in progress
  cancelGeneration();

  // Show loading state
  loadingEl.style.display = 'flex';
  textareaEl.style.display = 'none';
  textareaEl.value = '';
  textareaEl.readOnly = true;
  errorEl.style.display = 'none';
  setResultControlsVisible(false);
  updateCounter();

  // Detect and redact PII before it leaves the browser
  const { redactedText, hasPII, piiTypes } = detectAndRedactPII(currentSelection);

  // Show PII warning if detected (once per modal)
  if (hasPII && !modal.querySelector('.aai-crm-pii-warning')) {
    const originalLabel = modal.querySelector('.aai-crm-section label');
    const piiWarning = document.createElement('div');
    piiWarning.className = 'aai-crm-pii-warning';
    piiWarning.textContent = `⚠️ PII detected and redacted (${piiTypes.join(', ')}) before sending to the AI`;
    originalLabel.parentNode.insertBefore(piiWarning, originalLabel.nextSibling);
  }

  const showError = (message) => {
    console.error('AAI CRM Extension: Error generating result', message);
    loadingEl.style.display = 'none';
    textareaEl.style.display = 'none';
    modal.querySelector('.aai-crm-counter').style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = `Error: ${message}. Please try again or check your settings.`;

    // Show retry button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'aai-crm-secondary-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.style.marginTop = '10px';
    retryBtn.addEventListener('click', () => {
      errorEl.textContent = '';
      generateEnhancedText(additionalContext, label);
    });
    errorEl.appendChild(retryBtn);

    // Earlier versions are still available
    if (versions.length > 0) {
      const backBtn = document.createElement('button');
      backBtn.className = 'aai-crm-secondary-btn';
      backBtn.textContent = 'Back to previous version';
      backBtn.style.marginTop = '10px';
      backBtn.style.marginLeft = '8px';
      backBtn.addEventListener('click', () => showVersion(versionIndex));
      errorEl.appendChild(backBtn);
    }

    retryBtn.focus();
    updateVersionNav();
  };

  const port = chrome.runtime.connect({ name: 'aai-generate' });
  generationPort = port;
  updateVersionNav();

  port.onMessage.addListener((message) => {
    if (port !== generationPort || !modal) {
      return; // Superseded by a newer request or modal closed
    }

    if (message.type === 'delta') {
      if (textareaEl.style.display === 'none') {
        loadingEl.style.display = 'none';
        textareaEl.style.display = 'block';
      }
      textareaEl.value += message.text;
      textareaEl.scrollTop = textareaEl.scrollHeight;
      updateCounter();
    } else if (message.type === 'done') {
      generationPort = null;
      port.disconnect();

      versions.push({ text: message.text, label: versions.length === 0 ? 'Original' : label });
      showVersion(versions.length - 1);
      textareaEl.focus();

      // Hide flair section after regeneration
      if (additionalContext) {
        modal.querySelector('.aai-crm-flair-section').style.display = 'none';
        modal.querySelector('.aai-crm-flair-input').value = '';
      }
    } else if (message.type === 'error') {
      generationPort = null;
      port.disconnect();
      showError(message.error);
    }
  });

  port.onDisconnect.addListener(() => {
    // Background worker went away without finishing (e.g. extension reloaded)
    if (port === generationPort) {
      generationPort = null;
      if (modal) {
        showError('Connection to extension lost');
      }
    }
  });

  port.postMessage({
    mode: currentMode,
    text: redactedText,
    additionalContext: additionalContext
  });
}

/**
 * Cancel an in-progress generation, if any
 */
function cancelGeneration() {
  if (generationPort) {
    const port = generationPort;
    generationPort = null;
    port.disconnect();
  }
}

/**
 * Keyboard handling while a modal is open: Esc closes, Ctrl/Cmd+Enter inserts, Tab stays inside
 */
function handleModalKeydown(event) {
  const openModalEl = document.querySelector('.aai-crm-modal');
  if (!openModalEl) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (openModalEl === modal) {
      closeModal();
    } else {
      openModalEl.remove();
    }
    return;
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && openModalEl === modal) {
    const insertBtn = modal.querySelector('#aai-crm-copy-close');
    if (insertBtn.style.display !== 'none') {
      event.preventDefault();
      event.stopPropagation();
      insertAndClose();
    }
    return;
  }

  if (event.key === 'Tab') {
    const focusable = Array.from(openModalEl.querySelectorAll('button, textarea, input'))
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const inside = openModalEl.contains(document.activeElement);

    if (event.shiftKey && (document.activeElement === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }
}

/**
 * Visible, writable text fields across the page and same-origin iframes
 */
function visibleEditableFields() {
  const fields = [];
  for (const doc of accessibleDocuments()) {
    const candidates = doc.querySelectorAll('textarea, input, [contenteditable]:not([contenteditable="false"])');
    for (const el of candidates) {
      if (el.closest(OWN_UI_SELECTOR) || !isEditableElement(el) || editableRoot(el) !== el) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      const style = doc.defaultView.getComputedStyle(el);
      if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
        fields.push(el);
      }
    }
  }
  return fields;
}

/**
 * Decide where the result goes:
 * - Enhance: replace the selected text, if it was in an editable field and hasn't changed
 * - Otherwise: insert at the cursor of the last field the user typed in,
 *   or into the only text field on the page
 * Returns null when there's no safe target (the text is then only copied).
 */
function resolveInsertTarget() {
  const ctx = selectionContext;

  if (currentMode === 'enhance' && ctx?.editable?.isConnected && isEditableElement(ctx.editable)) {
    const el = ctx.editable;

    if (isTextField(el)) {
      // Selection still holds the same text? Otherwise look for it (the field may have shifted)
      let start = ctx.start;
      let end = ctx.end;
      if (el.value.substring(start, end).trim() !== ctx.text) {
        const found = el.value.indexOf(ctx.text);
        if (found === -1) {
          return null;
        }
        start = found;
        end = found + ctx.text.length;
      }
      return { el, kind: 'replace', start, end };
    }

    if (ctx.range && ctx.range.toString().trim() === ctx.text) {
      return { el, kind: 'replace', range: ctx.range };
    }
    return null;
  }

  if (lastEditable?.el?.isConnected && isEditableElement(lastEditable.el)) {
    const el = lastEditable.el;
    // Don't overwrite the selected message if it lives in the same field
    if (ctx?.editable === el && isTextField(el)) {
      return { el, kind: 'insert', start: ctx.end, end: ctx.end };
    }
    return { el, kind: 'insert', range: lastEditable.range };
  }

  const fields = visibleEditableFields();
  if (fields.length === 1) {
    return { el: fields[0], kind: 'insert' };
  }

  return null;
}

/**
 * Insert text into a target from resolveInsertTarget(), keeping the field's undo history
 */
function insertIntoTarget(target, text) {
  const { el } = target;
  const doc = el.ownerDocument;

  doc.defaultView.focus();
  el.focus();

  if (isTextField(el)) {
    const start = target.start ?? el.selectionStart ?? el.value.length;
    const end = target.end ?? el.selectionEnd ?? start;
    const before = el.value;

    el.setSelectionRange(start, end);
    const ok = doc.execCommand('insertText', false, text);
    if (!ok || el.value === before) {
      el.setRangeText(text, start, end, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Rich-text editor: restore the saved range, or put the cursor at the end
  let range = target.range;
  if (!range || !el.contains(range.startContainer)) {
    range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const ok = doc.execCommand('insertText', false, text);
  if (!ok) {
    range.deleteContents();
    range.insertNode(doc.createTextNode(text));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Insert the result into the CRM (and copy it to the clipboard as a backup), then close
 */
async function insertAndClose() {
  const text = modal.querySelector('.aai-crm-enhanced-text').value;
  if (!text.trim()) {
    return;
  }

  const target = resolveInsertTarget();

  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (error) {
    console.error('AAI CRM Extension: Could not copy to clipboard', error);
  }

  closeModal({ restoreFocus: !target });

  let inserted = false;
  if (target) {
    try {
      inserted = insertIntoTarget(target, text);
    } catch (error) {
      console.error('AAI CRM Extension: Error inserting text', error);
    }
  }

  if (inserted) {
    showToast(target.kind === 'replace' ? 'Replaced your selected text' : 'Inserted into the text field');
  } else if (copied) {
    showToast('Copied - click where you want it and press Ctrl+V');
  } else {
    showToast('Could not insert or copy the text', true);
  }
}

/**
 * Close the modal
 */
function closeModal({ restoreFocus = true } = {}) {
  cancelGeneration();
  if (modal) {
    modal.remove();
    modal = null;
  }
  if (restoreFocus && restoreFocusEl?.isConnected) {
    try {
      restoreFocusEl.ownerDocument.defaultView.focus();
      restoreFocusEl.focus({ preventScroll: true });
    } catch (e) {
      // Element can't take focus
    }
  }
}

/**
 * Show a toast notification
 */
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `aai-crm-toast ${isError ? 'aai-crm-toast-error' : ''}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('aai-crm-visible');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('aai-crm-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
