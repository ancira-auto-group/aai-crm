// Stand-in for the OpenAI Chat Completions streaming API, for tests.
// Replies "Mock reply from <model>." and remembers the last request (GET /__last).
// Messages containing FAIL429 get a 429 error.
import http from 'node:http';

const port = Number(process.env.MOCK_OPENAI_PORT || 4010);
let last = null;

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__last') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(last));
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    last = JSON.parse(body || '{}');
    const lastUser = last.messages?.filter((m) => m.role === 'user').at(-1)?.content || '';
    if (lastUser.includes('FAIL429')) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Rate limit' } }));
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const word of `Mock reply from ${last.model}.`.split(' ')) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `${word} ` } }] })}\n\n`);
      await new Promise((r) => setTimeout(r, 5));
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
}).listen(port, () => console.log(`mock OpenAI on ${port}`));
