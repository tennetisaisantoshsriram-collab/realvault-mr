/**
 * Vercel Serverless Function proxy for Groq Chat + Vision endpoints so no API key is shipped
 * inside the client WebXR bundle. Set GROQ_API_KEY in Vercel Project Environment Variables.
 */
export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    res.status(501).json({
      error:
        'Server GROQ_API_KEY is not configured. Set GROQ_API_KEY in Vercel env or click AI Key in the HUD.',
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const upstream = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
      return;
    }

    if (req.method === 'POST') {
      const bodyPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: bodyPayload,
      });
      const text = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Groq upstream request failed',
    });
  }
}
