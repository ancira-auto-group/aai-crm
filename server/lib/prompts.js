import { sql } from './db.js';

export const MODES = ['enhance', 'response'];

// Where the prompts lived before v3. Imported once, the first time a mode has no prompt in the database.
export const LEGACY_PROMPT_URLS = {
  enhance: 'https://gist.githubusercontent.com/29834329834932840320392/84b7d5917357b2d444b4b4b90fa384be/raw/aai-crm-system-prompt.txt',
  response: 'https://gist.githubusercontent.com/29834329834932840320392/7b24a6516236bb09849c921799802700/raw/aai-crm-response-system-prompt.txt'
};

export const FALLBACK_PROMPTS = {
  enhance: `You are a professional text enhancement assistant for automotive CRM communications. Your goal is to improve clarity, professionalism, and impact while preserving all key information.

Guidelines:
- Maintain the original meaning and key details
- Enhance clarity and readability
- Use professional but friendly tone appropriate for automotive industry
- Fix grammar and spelling errors
- Improve sentence structure and flow
- Keep the response concise and natural
- Do not add information that wasn't in the original text`,
  response: 'You are a professional response assistant for automotive CRM communications. Your goal is to suggest appropriate responses based on the customer\'s message.'
};

// Prompts change rarely; cache them per server instance for a minute
const CACHE_MS = 60 * 1000;
const cache = new Map();

export function clearPromptCache() {
  cache.clear();
}

export async function fetchPromptFromUrl(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  const text = (await response.text()).trim();
  if (!text) {
    throw new Error('The URL returned an empty prompt');
  }
  return text;
}

export async function getPrompt(mode) {
  const cached = cache.get(mode);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.content;
  }

  const [row] = await sql`SELECT content FROM prompts WHERE mode = ${mode}`;
  let content = row?.content;

  if (!content) {
    // First run: import the prompt the extension used to download, or fall back to the built-in one
    try {
      content = await fetchPromptFromUrl(LEGACY_PROMPT_URLS[mode]);
    } catch (error) {
      console.error(`Could not import legacy ${mode} prompt`, error);
      content = FALLBACK_PROMPTS[mode];
    }
    await sql`INSERT INTO prompts (mode, content) VALUES (${mode}, ${content}) ON CONFLICT (mode) DO NOTHING`;
  }

  cache.set(mode, { content, at: Date.now() });
  return content;
}
