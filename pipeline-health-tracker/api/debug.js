module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.ASHBY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ASHBY_API_KEY not configured' });

  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' };

  async function ashbyPost(endpoint, body = {}) {
    const r = await fetch(`https://api.ashbyhq.com/${endpoint}`, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    return r.json();
  }

  try {
    const data = await ashbyPost('interviewSchedule.list', { limit: 10 });
    const summary = (data.results || []).map(s => ({
      id: s.id,
      status: s.status,
      applicationId: s.applicationId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }));
    res.status(200).json({ summary, total: data.results?.length, moreDataAvailable: data.moreDataAvailable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
