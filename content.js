/**
 * Content Script for AAI CRM Extension
 * Handles text selection detection, floating action button, and modal UI
 */

// Constants
const MIN_SELECTION_LENGTH = 10;
const SELECTION_DEBOUNCE_MS = 300;
const BUTTON_OFFSET_PX = 10;
const FADE_IN_MS = 150;

// State
let selectionTimeout = null;
let floatingButtons = [];
let modal = null;
let currentSelection = '';
let currentMode = 'enhance'; // 'enhance' or 'response'
let originalFocusElement = null; // Store the element that had focus before modal opened

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
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('selectionchange', handleSelectionChange);
  console.log('AAI CRM Extension: Content script initialized');
}

/**
 * Handle mouse up event with debouncing
 */
function handleMouseUp(event) {
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    checkSelection(event);
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
        const iframeSelection = iframeEl.contentWindow.getSelection();

        if (iframeSelection && iframeSelection.toString().trim().length > 0) {
          selection = iframeSelection;
          doc = iframeDoc;
          iframe = iframeEl;
          console.log('AAI CRM Extension: Found selection in iframe');
          break;
        }
      } catch (e) {
        // Cross-origin iframe, skip it
        console.log('AAI CRM Extension: Cannot access iframe due to CORS');
      }
    }
  }

  return { selection, doc, iframe };
}

/**
 * Handle selection change (cleanup)
 */
function handleSelectionChange() {
  const { selection } = getActiveSelection();
  if (!selection || selection.toString().trim().length === 0) {
    removeFloatingButton();
  }
}

/**
 * Check if there's a valid text selection
 */
function checkSelection(event) {
  const { selection, doc, iframe } = getActiveSelection();
  const text = selection ? selection.toString().trim() : '';

  if (text.length >= MIN_SELECTION_LENGTH) {
    currentSelection = text;
    showFloatingButton(selection, doc, iframe, event);
  } else {
    removeFloatingButton();
  }
}

/**
 * Show the floating action buttons near the selection
 */
function showFloatingButton(selection, doc, iframe, event) {
  removeFloatingButton();

  if (!selection || selection.rangeCount === 0) {
    console.log('AAI CRM Extension: No valid selection');
    return;
  }

  const range = selection.getRangeAt(0);
  let rect = range.getBoundingClientRect();

  console.log('AAI CRM Extension: Selection rect (raw):', rect);
  console.log('AAI CRM Extension: Is in iframe:', !!iframe);

  // Check if selection is inside an input/textarea element
  // For INPUT/TEXTAREA, the range bounding rect is often zero, so we need to use the element's rect
  let targetElement = null;

  // Try to find the input/textarea containing the selection
  if (rect.width === 0 && rect.height === 0) {
    // First check if range.startContainer or its parent is an input/textarea
    let node = range.startContainer;
    while (node && node !== doc) {
      if (node.nodeType === Node.ELEMENT_NODE &&
          (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) {
        targetElement = node;
        break;
      }
      node = node.parentNode;
    }

    // Fallback to activeElement
    if (!targetElement) {
      const activeEl = doc.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        targetElement = activeEl;
      }
    }

    if (targetElement) {
      console.log('AAI CRM Extension: Selection is inside input/textarea, using element rect');
      rect = targetElement.getBoundingClientRect();
    }
  }

  // If selection is in an iframe, we need to adjust coordinates
  if (iframe) {
    const iframeRect = iframe.getBoundingClientRect();
    console.log('AAI CRM Extension: Iframe rect:', iframeRect);

    // Create a new rect with adjusted coordinates
    rect = {
      top: rect.top + iframeRect.top,
      bottom: rect.bottom + iframeRect.top,
      left: rect.left + iframeRect.left,
      right: rect.right + iframeRect.left,
      width: rect.width,
      height: rect.height,
      x: rect.x + iframeRect.left,
      y: rect.y + iframeRect.top
    };

    console.log('AAI CRM Extension: Selection rect (adjusted):', rect);
  }

  console.log('AAI CRM Extension: Selection text:', selection.toString().substring(0, 50));
  console.log('AAI CRM Extension: Window scroll:', window.scrollX, window.scrollY);
  console.log('AAI CRM Extension: Viewport size:', window.innerWidth, window.innerHeight);

  // Position buttons just above the selection
  // Use fixed positioning relative to viewport
  let top = rect.top - 45; // 45px above selection (40px button + 5px gap)
  let left = rect.left;

  // Adjust if too close to top - position below instead
  if (top < 10) {
    top = rect.bottom + BUTTON_OFFSET_PX;
  }

  // Adjust if too close to right edge - shift left
  const buttonsWidth = 100; // Two 40px buttons + 10px gap + some padding
  if (left + buttonsWidth > window.innerWidth) {
    left = window.innerWidth - buttonsWidth - 10;
  }

  // Ensure buttons don't go off left edge
  if (left < 10) {
    left = 10;
  }

  console.log('AAI CRM Extension: Button position - top:', top, 'left:', left);

  // Create Enhance button
  const enhanceButton = document.createElement('button');
  enhanceButton.className = 'aai-crm-floating-button aai-crm-enhance-btn';
  enhanceButton.innerHTML = ENHANCE_ICON_SVG;
  enhanceButton.setAttribute('aria-label', 'Enhance text with AI');
  enhanceButton.setAttribute('title', 'Enhance Text');
  enhanceButton.style.top = `${top}px`;
  enhanceButton.style.left = `${left}px`;

  enhanceButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal('enhance');
  });

  document.body.appendChild(enhanceButton);
  floatingButtons.push(enhanceButton);

  // Create Response button (positioned 50px to the right of Enhance button)
  const responseButton = document.createElement('button');
  responseButton.className = 'aai-crm-floating-button aai-crm-response-btn';
  responseButton.innerHTML = RESPONSE_ICON_SVG;
  responseButton.setAttribute('aria-label', 'Suggest response with AI');
  responseButton.setAttribute('title', 'Suggest Response');
  responseButton.style.top = `${top}px`;
  responseButton.style.left = `${left + 50}px`; // 50px to the right of enhance button

  responseButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal('response');
  });

  document.body.appendChild(responseButton);
  floatingButtons.push(responseButton);

  // Fade in animation
  setTimeout(() => {
    floatingButtons.forEach(btn => btn.classList.add('aai-crm-visible'));
  }, 10);
}

/**
 * Remove the floating buttons
 */
function removeFloatingButton() {
  floatingButtons.forEach(btn => btn.remove());
  floatingButtons = [];
}

/**
 * Open the modal (enhance or response mode)
 */
function openModal(mode = 'enhance') {
  removeFloatingButton();
  currentMode = mode;

  // Store the currently focused element
  originalFocusElement = document.activeElement;

  // Check if API key is configured
  chrome.storage.local.get(['openai_api_key'], (result) => {
    if (!result.openai_api_key) {
      showSetupPrompt();
      return;
    }
    createModal(mode);
  });
}

/**
 * Show setup prompt when API key is missing
 */
function showSetupPrompt() {
  const setupModal = document.createElement('div');
  setupModal.className = 'aai-crm-modal';
  setupModal.innerHTML = `
    <div class="aai-crm-modal-content aai-crm-setup">
      <div class="aai-crm-modal-header">
        <h2>Setup Required</h2>
        <button class="aai-crm-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="aai-crm-modal-body">
        <p>Please configure your OpenAI API key in the extension settings to use text enhancement.</p>
        <button class="aai-crm-primary-btn" id="aai-crm-open-settings">Open Settings</button>
      </div>
    </div>
  `;

  document.body.appendChild(setupModal);

  setupModal.querySelector('.aai-crm-close-btn').addEventListener('click', () => {
    setupModal.remove();
  });

  setupModal.querySelector('#aai-crm-open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    setupModal.remove();
  });

  setupModal.addEventListener('click', (e) => {
    if (e.target === setupModal) {
      setupModal.remove();
    }
  });
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

  modal = document.createElement('div');
  modal.className = 'aai-crm-modal';
  modal.innerHTML = `
    <div class="aai-crm-modal-content">
      <div class="aai-crm-modal-header">
        <h2>${title}</h2>
        <button class="aai-crm-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="aai-crm-modal-body">
        <div class="aai-crm-section">
          <label>${originalLabel}</label>
          <div class="aai-crm-original-text">${escapeHtml(currentSelection)}</div>
        </div>
        <div class="aai-crm-section">
          <label>${resultLabel}</label>
          <div class="aai-crm-loading">
            <div class="aai-crm-spinner"></div>
            <p>${loadingText}</p>
          </div>
          <textarea class="aai-crm-enhanced-text" style="display: none;" rows="8"></textarea>
          <div class="aai-crm-error" style="display: none;"></div>
        </div>
        <div class="aai-crm-flair-section" style="display: none;">
          <label>Additional Context:</label>
          <input type="text" class="aai-crm-flair-input" placeholder="Add specific instructions or context...">
          <button class="aai-crm-secondary-btn aai-crm-flair-submit">Regenerate with Context</button>
        </div>
      </div>
      <div class="aai-crm-modal-footer">
        <button class="aai-crm-primary-btn" id="aai-crm-copy-close" style="display: none;">Copy & Close</button>
        <button class="aai-crm-secondary-btn" id="aai-crm-mix-it-up" style="display: none;">Mix It Up</button>
        <button class="aai-crm-secondary-btn" id="aai-crm-add-flair" style="display: none;">Add Some Flair</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Event listeners
  modal.querySelector('.aai-crm-close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  const copyCloseBtn = modal.querySelector('#aai-crm-copy-close');
  const mixItUpBtn = modal.querySelector('#aai-crm-mix-it-up');
  const addFlairBtn = modal.querySelector('#aai-crm-add-flair');
  const flairSection = modal.querySelector('.aai-crm-flair-section');
  const flairSubmitBtn = modal.querySelector('.aai-crm-flair-submit');

  copyCloseBtn.addEventListener('click', copyAndClose);
  mixItUpBtn.addEventListener('click', () => regenerateText());
  addFlairBtn.addEventListener('click', () => {
    flairSection.style.display = 'block';
    modal.querySelector('.aai-crm-flair-input').focus();
  });
  flairSubmitBtn.addEventListener('click', () => {
    const flair = modal.querySelector('.aai-crm-flair-input').value.trim();
    if (flair) {
      regenerateText(flair);
    }
  });

  // Initial generation
  generateEnhancedText();
}

/**
 * Generate enhanced text or suggested response using OpenAI API
 */
async function generateEnhancedText(additionalContext = '') {
  const loadingEl = modal.querySelector('.aai-crm-loading');
  const textareaEl = modal.querySelector('.aai-crm-enhanced-text');
  const errorEl = modal.querySelector('.aai-crm-error');
  const buttons = [
    modal.querySelector('#aai-crm-copy-close'),
    modal.querySelector('#aai-crm-mix-it-up'),
    modal.querySelector('#aai-crm-add-flair')
  ];

  // Show loading state
  loadingEl.style.display = 'flex';
  textareaEl.style.display = 'none';
  errorEl.style.display = 'none';
  buttons.forEach(btn => btn.style.display = 'none');

  try {
    // Detect and redact PII before sending to OpenAI
    const { redactedText, hasPII, piiTypes } = detectAndRedactPII(currentSelection);

    // Show PII warning if detected
    if (hasPII) {
      const originalLabel = modal.querySelector('.aai-crm-section label');
      const piiWarning = document.createElement('div');
      piiWarning.className = 'aai-crm-pii-warning';
      piiWarning.innerHTML = `⚠️ PII detected and redacted (${piiTypes.join(', ')}) before sending to OpenAI`;
      originalLabel.parentNode.insertBefore(piiWarning, originalLabel.nextSibling);
    }

    // Determine action and response key based on mode
    const action = currentMode === 'enhance' ? 'enhanceText' : 'suggestResponse';
    const responseKey = currentMode === 'enhance' ? 'enhancedText' : 'suggestedResponse';

    // Send request to background script with redacted text
    const response = await chrome.runtime.sendMessage({
      action: action,
      text: redactedText,
      additionalContext: additionalContext
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Show result
    loadingEl.style.display = 'none';
    textareaEl.style.display = 'block';
    textareaEl.value = response[responseKey];
    buttons.forEach(btn => btn.style.display = 'inline-block');

    // Hide flair section after regeneration
    if (additionalContext) {
      modal.querySelector('.aai-crm-flair-section').style.display = 'none';
      modal.querySelector('.aai-crm-flair-input').value = '';
    }

  } catch (error) {
    console.error('AAI CRM Extension: Error generating result', error);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = `Error: ${error.message}. Please try again or check your settings.`;

    // Show retry button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'aai-crm-secondary-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.style.marginTop = '10px';
    retryBtn.addEventListener('click', () => {
      errorEl.innerHTML = '';
      generateEnhancedText(additionalContext);
    });
    errorEl.appendChild(retryBtn);
  }
}

/**
 * Regenerate text (Mix It Up)
 */
function regenerateText(additionalContext = '') {
  generateEnhancedText(additionalContext);
}

/**
 * Get all focusable elements on the page
 */
function getFocusableElements() {
  const selector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  const elements = Array.from(document.querySelectorAll(selector));

  // Filter out our own extension elements
  return elements.filter(el => {
    return !el.closest('.aai-crm-modal') &&
           !el.closest('.aai-crm-floating-button') &&
           !el.closest('.aai-crm-toast');
  });
}

/**
 * Navigate forward through focusable elements
 */
function navigateToElement(startElement, steps) {
  const focusableElements = getFocusableElements();

  if (focusableElements.length === 0) {
    return null;
  }

  // Find the index of the start element
  let currentIndex = focusableElements.indexOf(startElement);

  // If start element not found, start from the beginning
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  // Move forward by the specified number of steps
  const targetIndex = (currentIndex + steps) % focusableElements.length;

  return focusableElements[targetIndex];
}

/**
 * Insert text into an element
 */
function insertTextIntoElement(element, text) {
  if (!element) {
    console.log('AAI CRM Extension: No element provided for insertion');
    return false;
  }

  console.log('AAI CRM Extension: Attempting to insert into element:', element.tagName, element.className, element);

  // Focus the element first
  element.focus();

  // Try to find an editable child element if this element isn't directly editable
  let targetElement = element;

  // Check if element has contentEditable children
  if (!element.isContentEditable && element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
    const editableChild = element.querySelector('[contenteditable="true"], input:not([disabled]), textarea:not([disabled])');
    if (editableChild) {
      console.log('AAI CRM Extension: Found editable child element:', editableChild.tagName);
      targetElement = editableChild;
      targetElement.focus();
    }
  }

  // Handle different element types
  if (targetElement.isContentEditable) {
    console.log('AAI CRM Extension: Inserting into contentEditable element');
    // For contentEditable elements
    const selection = window.getSelection();
    const range = document.createRange();

    // Clear existing content and insert new text
    range.selectNodeContents(targetElement);
    selection.removeAllRanges();
    selection.addRange(range);

    // Insert the text
    document.execCommand('insertText', false, text + ' ');

    // Trigger input event for frameworks that listen to it
    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
    targetElement.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } else if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
    console.log('AAI CRM Extension: Inserting into INPUT/TEXTAREA element');
    // For input and textarea elements
    const start = targetElement.selectionStart || 0;
    const end = targetElement.selectionEnd || 0;
    const value = targetElement.value || '';

    // Insert text at cursor position
    targetElement.value = value.substring(0, start) + text + ' ' + value.substring(end);

    // Move cursor to end of inserted text
    const newPosition = start + text.length + 1;
    targetElement.selectionStart = newPosition;
    targetElement.selectionEnd = newPosition;

    // Trigger events for frameworks
    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
    targetElement.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  console.log('AAI CRM Extension: Element is not editable, copying to clipboard instead');
  return false;
}

/**
 * Find the best target element for pasting
 */
function findBestPasteTarget() {
  // First, try to find a focused editable element
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || activeEl.isContentEditable)) {
    console.log('AAI CRM Extension: Using currently focused element');
    return activeEl;
  }

  // Look for visible textarea or input elements (prioritize textarea)
  const textareas = Array.from(document.querySelectorAll('textarea:not([disabled]):not([readonly])'));
  const visibleTextareas = textareas.filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  });

  if (visibleTextareas.length > 0) {
    console.log('AAI CRM Extension: Found visible textarea:', visibleTextareas[0]);
    return visibleTextareas[0];
  }

  // Look for visible text inputs
  const inputs = Array.from(document.querySelectorAll('input[type="text"]:not([disabled]):not([readonly]), input:not([type]):not([disabled]):not([readonly])'));
  const visibleInputs = inputs.filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  });

  if (visibleInputs.length > 0) {
    console.log('AAI CRM Extension: Found visible input:', visibleInputs[0]);
    return visibleInputs[0];
  }

  // Look for contentEditable elements
  const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
  const visibleEditables = editables.filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  });

  if (visibleEditables.length > 0) {
    console.log('AAI CRM Extension: Found visible contentEditable:', visibleEditables[0]);
    return visibleEditables[0];
  }

  console.log('AAI CRM Extension: No suitable paste target found');
  return null;
}

/**
 * Auto-paste text into the CRM field
 */
async function autoPasteText(text, tabCount) {
  try {
    // Copy to clipboard first (as backup)
    await navigator.clipboard.writeText(text);

    console.log('AAI CRM Extension: Starting auto-paste with tab count:', tabCount);
    console.log('AAI CRM Extension: Original focus element:', originalFocusElement);

    // Wait a moment to ensure the modal has closed
    await new Promise(resolve => setTimeout(resolve, 200));

    // Find the best target element (smarter approach)
    const targetElement = findBestPasteTarget();

    console.log('AAI CRM Extension: Target element for paste:', targetElement);

    if (!targetElement) {
      console.error('AAI CRM Extension: Could not find target element');
      throw new Error('Could not find target element (text is in clipboard)');
    }

    // Insert the text
    const success = insertTextIntoElement(targetElement, text);

    if (!success) {
      console.error('AAI CRM Extension: Failed to insert text, element was not editable');
      throw new Error('Target element is not editable (text is in clipboard)');
    }

    console.log('AAI CRM Extension: Successfully auto-pasted text');
    return true;
  } catch (error) {
    console.error('AAI CRM Extension: Error auto-pasting', error);
    throw error;
  }
}

/**
 * Copy enhanced text to clipboard and close modal
 */
async function copyAndClose() {
  const textareaEl = modal.querySelector('.aai-crm-enhanced-text');
  const text = textareaEl.value;

  try {
    // Determine tab count based on mode
    const tabCount = currentMode === 'enhance' ? 6 : 9;

    // Close modal first
    closeModal();

    // Auto-paste the text
    await autoPasteText(text, tabCount);

    showToast('Text pasted successfully!');
  } catch (error) {
    console.error('AAI CRM Extension: Error with auto-paste', error);
    // Text is already in clipboard from autoPasteText
    showToast('Copied to clipboard - please paste manually (Ctrl+V)', false);
  }
}

/**
 * Close the modal
 */
function closeModal() {
  if (modal) {
    modal.remove();
    modal = null;
  }
}

/**
 * Show a toast notification
 */
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `aai-crm-toast ${isError ? 'aai-crm-toast-error' : ''}`;
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
