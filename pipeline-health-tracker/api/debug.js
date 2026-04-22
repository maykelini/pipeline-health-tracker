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
    const ids = [
      '4c1bb35f-2951-4abe-b3aa-f6acf9d3d28d', // Gabriel - Waiting on Feedback
      'bdd62a2a-9d69-4639-ae28-7fe17fce4238',  // New candidate - Needs Decision
      '4975a629-6439-4e6b-af5b-fdd25695ceeb'   // Joseph - Needs Decision
    ];

    const results = {};
    for (const id of ids) {
      const data = await ashbyPost('interviewSchedule.list', { applicationId: id });
      results[id] = (data.results || []).map(s => ({
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        syncToken: data
