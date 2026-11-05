const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MAX_COMPLETION_TOKENS = 800;
const TEMPERATURE = 0.7; // Only honored because reasoning_effort is 'none'
const REASONING_EFFORT = 'none'; // Text rewriting doesn't need reasoning; keeps replies fast and cheap
const IDLE_TIMEOUT_MS = 15000; // Max wait for the first byte, and between streamed chunks

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set on the server');
  }
  return key;
}

async function toApiError(response) {
  const data = await response.json().catch(() => ({}));
  const detail = data.error?.message || `${response.status} ${response.statusText}`;
  console.error('OpenAI error', response.status, detail);

  if (response.status === 401) {
    return new Error('The server\'s OpenAI key was rejected. Contact your administrator.');
  } else if (response.status === 404) {
    return new Error('The selected AI model is not available. Contact your administrator.');
  } else if (response.status === 429) {
    return new Error('The AI service is busy or the spending limit was reached. Please try again shortly.');
  } else if (response.status >= 500) {
    return new Error('The AI service is temporarily unavailable. Please try again.');
  }
  return new Error(`AI request failed: ${detail}`);
}

/**
 * Stream a Chat Completions request.
 * Calls onDelta(text) for each chunk; resolves with { text, usage, truncated }.
 */
export async function streamChat({ model, messages, signal, onDelta }) {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;

  const resetTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  };
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    resetTimeout();

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey()}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        temperature: TEMPERATURE,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage = null;
    let finishReason = null;

    // Server-sent events: lines of "data: {json}", ending with "data: [DONE]"
    while (true) {
      resetTimeout();
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          continue;
        }

        const chunk = JSON.parse(data);
        if (chunk.error) {
          throw new Error(chunk.error.message || 'AI streaming error');
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }

    if (!text.trim()) {
      throw new Error('The AI returned an empty response. Please try again.');
    }
    return { text, usage, truncated: finishReason === 'length' };

  } catch (error) {
    if (error.name === 'AbortError') {
      const wrapped = new Error(timedOut ? 'Request timed out. Please try again.' : 'Request cancelled.');
      wrapped.cancelled = !timedOut;
      throw wrapped;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
