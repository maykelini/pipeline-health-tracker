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
    // Try different sort options
    const asc = await ashbyPost('interviewSchedule.list', { limit: 3, syncToken: 'WP9xnLJZJ' });
    const desc = await ashbyPost('interviewSchedule.list', { limit: 3, orderBy: 'createdAt_DESC' });
    const desc2 = await ashbyPost('interviewSchedule.list', { limit: 3, sort: 'desc' });
    
    res.status(200).json({ 
      withSyncToken: asc.results?.map(s => ({ status: s.status, createdAt: s.createdAt })),
      withOrderBy: desc.results?.map(s => ({ status: s.status, createdAt: s.createdAt })),
      withSort: desc2.results?.map(s => ({ status: s.status, createdAt: s.createdAt }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
