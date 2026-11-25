import crypto from 'node:crypto';
import { after } from 'next/server';
import { requireUser } from '../../../lib/auth.js';
import { sql } from '../../../lib/db.js';
import { HttpError, readJson, route, str } from '../../../lib/http.js';
import { estimateCost, modelFor } from '../../../lib/models.js';
import { streamChat } from '../../../lib/openai.js';
import { getPrompt, MODES } from '../../../lib/prompts.js';
import { attributeUsage } from '../../../lib/rooftops.js';
import { checkExtensionVersion } from '../../../lib/version.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TEXT_CHARS = 8000;
const MAX_INSTRUCTION_CHARS = 1000;
const MAX_CONVERSATION_MESSAGES = 12;
const MAX_CONVERSATION_MESSAGE_CHARS = 1000;
const MAX_CONVERSATION_CHARS = 6000;

/**
 * The recent texts in the conversation the user is working in, read from the CRM's SMS window by the extension:
 * [{ from: 'customer'|'dealership', name?, time?, text }], oldest first. Anything malformed is dropped, and the
 * oldest messages go first if it's too long. Older extensions send nothing.
 */
function parseConversation(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const messages = value.slice(-MAX_CONVERSATION_MESSAGES)
    .filter((m) => m && (m.from === 'customer' || m.from === 'dealership'))
    .map((m) => ({ from: m.from, name: clean(m.name, 40), time: clean(m.time, 40), text: clean(m.text, MAX_CONVERSATION_MESSAGE_CHARS) }))
    .filter((m) => m.text);
  let total = messages.reduce((sum, m) => sum + m.text.length, 0);
  while (total > MAX_CONVERSATION_CHARS && messages.length) {
    total -= messages.shift().text.length;
  }
  return messages;
}

function conversationContext(conversation) {
  if (!conversation.length) {
    return '';
  }
  const lines = conversation.map((m) => {
    const who = m.from === 'customer' ? 'Customer' : 'Dealership';
    return `${m.time ? `[${m.time}] ` : ''}${who}${m.name ? ` (${m.name})` : ''}: ${m.text}`;
  });
  return '\n\n# Conversation so far\n' +
    'These are the most recent text messages between the dealership and this customer, oldest first. ' +
    'Use them only as background: what has already been asked, answered, offered or promised. ' +
    'Don\'t repeat information the customer already has, don\'t contradict it, and don\'t answer questions that were already answered. ' +
    'Only work on the text you are given below.\n' +
    lines.join('\n');
}

/** "AWC: Ancira-Winton Chevrolet, 6111 Bandera Rd..., phone ..., hours ..." from the Rooftops tab */
function storeDetails(r) {
  const fullName = r.fullName && r.fullName !== r.name ? r.fullName : null;
  const parts = [fullName, r.address, r.phone && `phone ${r.phone}`, r.hours && `hours: ${r.hours}`].filter(Boolean);
  return parts.length ? `${r.name}: ${parts.join(', ')}` : r.name;
}

/**
 * Tell the model which dealership the sender works at, with that store's details from the Rooftops tab,
 * so it uses the right name, address, phone and hours. Rooftop names are the store abbreviations (NIS, AWC...).
 */
function rooftopContext(rooftops) {
  const active = (rooftops || []).filter((r) => r.active);
  const noDetails = 'do not add any dealership name, address or phone number that is not already in the text';
  if (active.length === 1) {
    const r = active[0];
    return `# Sender's dealership\nThe person sending this message works at ${r.name}${r.fullName && r.fullName !== r.name ? ` (${r.fullName})` : ''}.\n` +
      `Store details: ${storeDetails(r)}\n` +
      'When the message needs a dealership name, address, phone number, hours or directions, use these details only. ' +
      'Never use another dealership\'s details, and don\'t make up details that aren\'t listed.';
  }
  if (active.length > 1) {
    return '# Sender\'s dealership\nThe person sending this message works at these dealerships:\n' +
      active.map((r) => `- ${storeDetails(r)}`).join('\n') +
      `\nWhen the message needs dealership details, use the one the message is about. If it isn't clear which one, ${noDetails}.`;
  }
  return `# Sender's dealership\nThe sender's dealership is unknown, so ${noDetails}.`;
}

function buildMessages(systemPrompt, mode, text, instructions, rooftops, conversation) {
  const messages = [
    { role: 'system', content: `${systemPrompt}\n\n${rooftopContext(rooftops)}${conversationContext(conversation)}` },
    { role: 'user', content: mode === 'enhance' ? `Please enhance the following text:\n\n${text}` : text }
  ];
  if (instructions) {
    messages.push({ role: 'user', content: `Additional instructions: ${instructions}` });
  }
  return messages;
}

/**
 * POST /api/generate  { mode: 'enhance'|'response', text, additionalContext?, rooftopId?, variant?, conversation? }
 * rooftopId: the store a multi-store user picked; the request then counts 100% toward it.
 * conversation: recent texts with the customer, for context (see parseConversation).
 * Streams server-sent events:
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done","text":"...","truncated":false}
 *   data: {"type":"error","error":"..."}
 * Closing the request cancels the OpenAI call.
 */
export const POST = route(async (request) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID(); // Sent with the result so the extension can report what happened to it
  checkExtensionVersion(request);
  const user = await requireUser(request);
  const body = await readJson(request);

  const mode = body.mode;
  if (!MODES.includes(mode)) {
    throw new HttpError(400, 'Unknown mode');
  }
  const text = str(body.text, { field: 'Text', max: MAX_TEXT_CHARS, required: true });
  const instructions = str(body.additionalContext, { field: 'Instructions', max: MAX_INSTRUCTION_CHARS });
  const variant = str(body.variant, { field: 'Variant', max: 40 }) || null;
  const conversation = parseConversation(body.conversation);

  // A multi-store user's request counts toward the store they picked (their own active rooftops only).
  // With no valid pick (none chosen yet, or an older extension), it counts toward their first active store,
  // alphabetically: the same one the extension preselects. Users with no active store stay unassigned.
  const active = user.rooftops.filter((r) => r.active);
  const chosen = active.find((r) => r.id === body.rooftopId) || active[0];
  const rooftops = chosen ? [chosen] : [];

  const model = modelFor(user);
  const messages = buildMessages(await getPrompt(mode), mode, text, instructions, rooftops, conversation);
  const encoder = new TextEncoder();
  const setupMs = Date.now() - startedAt;

  // Usage is written after the response has been sent, so the database never delays the result.
  // after() keeps the function alive until it's done.
  let finishUsage;
  const usageReady = new Promise((resolve) => { finishUsage = resolve; });
  after(async () => {
    const record = await usageReady;
    const dbStart = Date.now();
    try {
      const [event] = await sql`
        INSERT INTO usage_events (user_id, mode, model, input_tokens, output_tokens, cost_usd, status,
                                  setup_ms, first_token_ms, total_ms, request_id, variant, context_messages)
        VALUES (${user.id}, ${mode}, ${model}, ${record.inputTokens}, ${record.outputTokens},
                ${estimateCost(model, record.inputTokens, record.outputTokens)}, ${record.status},
                ${setupMs}, ${record.firstTokenMs}, ${record.totalMs}, ${requestId}, ${variant}, ${conversation.length})
        RETURNING id`;
      await attributeUsage(event.id, rooftops);
      await sql`UPDATE users SET last_active_at = now() WHERE id = ${user.id}`;
    } catch (error) {
      console.error('Could not record usage', error);
    }
    console.log(`generate user=${user.id} model=${model} status=${record.status} context=${conversation.length} setup=${setupMs}ms ` +
      `first_token=${record.firstTokenMs ?? '-'}ms total=${record.totalMs}ms usage_write=${Date.now() - dbStart}ms`);
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client went away; nothing to send to
        }
      };

      let status = 'ok';
      let usage = null;
      let result = null;
      let failure = null;
      let firstTokenMs = null;

      try {
        result = await streamChat({
          model,
          messages,
          signal: request.signal,
          onDelta: (delta) => {
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - startedAt;
            }
            send({ type: 'delta', text: delta });
          }
        });
        usage = result.usage;
      } catch (error) {
        status = error.cancelled ? 'cancelled' : 'error';
        failure = error;
      }

      if (failure) {
        if (status === 'error') {
          console.error('Generation failed', failure);
          send({ type: 'error', error: failure.message });
        }
      } else {
        send({ type: 'done', text: result.text.trim(), truncated: result.truncated, requestId });
      }

      try {
        controller.close();
      } catch {
        // Already closed by the client disconnecting
      }

      finishUsage({
        status,
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        firstTokenMs,
        totalMs: Date.now() - startedAt
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
});
