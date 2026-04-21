module.exports = async function  if (req.method !== 'POST') return res.status(405).end();
  const { webhook, text } = req.body;
  if (!webhook || !text) return res.status(400).json({ error: 'Missing webhook or text' });

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!r.ok) throw new Error(`Slack returned ${r.status}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
