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
    // Test if application.list supports updatedAfter filter
    const test1 = await ashbyPost('application.list', { 
      limit: 5, 
      status: 'Active',
      updatedAfter: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
    });

    // Also check what fields application.list supports
    const test2 = await ashbyPost('application.list', { limit: 1, status: 'Active' });
    
    res.status(200).json({ 
      withUpdatedAfter: { success: test1.success, count: test1.results?.length, error: test1.errors },
      sampleKeys: test2.results?.[0] ? Object.keys(test2.results[0]) : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
