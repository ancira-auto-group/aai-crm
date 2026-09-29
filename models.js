/**
 * Shared model catalog for AAI CRM Extension
 * Loaded by the background service worker (importScripts) and the options page (<script>).
 *
 * Prices are USD per 1M tokens (standard tier) and are used only for cost estimates.
 */

// eslint-disable-next-line no-unused-vars
const AAI_MODELS = {
  'gpt-6-luna': {
    label: 'GPT-6 Luna (recommended)',
    inputPer1M: 0.10,
    outputPer1M: 0.50
  },
  'gpt-6-sol': {
    label: 'GPT-6 Sol (higher quality)',
    inputPer1M: 2.00,
    outputPer1M: 10.00
  }
};

// eslint-disable-next-line no-unused-vars
const AAI_DEFAULT_MODEL = 'gpt-6-luna';
