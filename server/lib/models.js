/**
 * Model catalog. Prices are USD per 1M tokens (standard tier), used only for usage estimates.
 * Update prices here when OpenAI changes them; past usage rows keep the cost recorded at the time.
 */
export const MODELS = {
  'gpt-6-luna': {
    label: 'GPT-6 Luna (fast, lowest cost)',
    inputPer1M: 0.10,
    outputPer1M: 0.50
  },
  'gpt-6.1-terra': {
    label: 'GPT-6.1 Terra (balanced)',
    inputPer1M: 1.00,
    outputPer1M: 5.00
  },
  'gpt-6.1-sol': {
    label: 'GPT-6.1 Sol (highest quality)',
    inputPer1M: 2.00,
    outputPer1M: 10.00
  }
};

export const DEFAULT_MODEL = MODELS[process.env.DEFAULT_MODEL] ? process.env.DEFAULT_MODEL : 'gpt-6-luna';

export function modelFor(user) {
  return MODELS[user?.model] ? user.model : DEFAULT_MODEL;
}

export function estimateCost(model, inputTokens, outputTokens) {
  const pricing = MODELS[model];
  if (!pricing) {
    return 0;
  }
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1e6;
}

export function modelList() {
  return Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, default: id === DEFAULT_MODEL }));
}
