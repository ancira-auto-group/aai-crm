import { requireUser } from '../../../lib/auth.js';
import { sql } from '../../../lib/db.js';
import { HttpError, readJson, route, str } from '../../../lib/http.js';
import { estimateCost, modelFor } from '../../../lib/models.js';
import { streamChat } from '../../../lib/openai.js';
import { getPrompt, MODES } from '../../../lib/prompts.js';
import { checkExtensionVersion } from '../../../lib/version.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TEXT_CHARS = 8000;
const MAX_INSTRUCTION_CHARS = 1000;

function buildMessages(systemPrompt, mode, text, instructions) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: mode === 'enhance' ? `Please enhance the following text:\n\n${text}` : text }
  ];
  if (instructions) {
    messages.push({ role: 'user', content: `Additional instructions: ${instructions}` });
  }
  return messages;
}

/**
 * POST /api/generate  { mode: 'enhance'|'response', text, additionalContext? }
 * Streams server-sent events:
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done","text":"...","truncated":false}
 *   data: {"type":"error","error":"..."}
 * Closing the request cancels the OpenAI call.
 */
export const POST = route(async (request) => {
  checkExtensionVersion(request);
  const user = await requireUser(request);
  const body = await readJson(request);

  const mode = body.mode;
  if (!MODES.includes(mode)) {
    throw new HttpError(400, 'Unknown mode');
  }
  const text = str(body.text, { field: 'Text', max: MAX_TEXT_CHARS, required: true });
  const instructions = str(body.additionalContext, { field: 'Instructions', max: MAX_INSTRUCTION_CHARS });

  const model = modelFor(user);
  const messages = buildMessages(await getPrompt(mode), mode, text, instructions);
  const encoder = new TextEncoder();

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

      try {
        result = await streamChat({
          model,
          messages,
          signal: request.signal,
          onDelta: (delta) => send({ type: 'delta', text: delta })
        });
        usage = result.usage;
      } catch (error) {
        status = error.cancelled ? 'cancelled' : 'error';
        failure = error;
      }

      // Record usage before closing the stream so the write isn't cut off when the function ends
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      try {
        await sql`
          INSERT INTO usage_events (user_id, rooftop_id, mode, model, input_tokens, output_tokens, cost_usd, status)
          VALUES (${user.id}, ${user.rooftop_id}, ${mode}, ${model}, ${inputTokens}, ${outputTokens},
                  ${estimateCost(model, inputTokens, outputTokens)}, ${status})`;
        await sql`UPDATE users SET last_active_at = now() WHERE id = ${user.id}`;
      } catch (error) {
        console.error('Could not record usage', error);
      }

      if (failure) {
        if (status === 'error') {
          console.error('Generation failed', failure);
          send({ type: 'error', error: failure.message });
        }
      } else {
        send({ type: 'done', text: result.text.trim(), truncated: result.truncated });
      }

      try {
        controller.close();
      } catch {
        // Already closed by the client disconnecting
      }
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
