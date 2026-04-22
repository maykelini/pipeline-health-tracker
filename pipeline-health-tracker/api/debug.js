module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.ASHBY_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!apiKey) return res.status(500).json({ error: 'ASHBY_API_KEY not configured' });

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' };

  async function ashbyPost(endpoint, body = {}) {
    const r = await fetch(`https://api.ashbyhq.com/${endpoint}`, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    return r.json();
  }

  try {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    let cursor = null;
    let hasMore = true;
    let pages = 0;
    let targetSyncToken = null;
    let lastSyncToken = null;

    while (hasMore && pages < 200) {
      const body = { limit: 100 };
      if (cursor) body.cursor = cursor;
      const data = await ashbyPost('interviewSchedule.list', body);
      if (!data.success) break;

      const results = data.results || [];
      lastSyncToken = data.syncToken;

      // Check if any result in this page is within our cutoff
      const hasRecent = results.some(s => new Date(s.createdAt) >= cutoff);
      if (hasRecent && !targetSyncToken) {
        targetSyncToken = lastSyncToken;
      }

      hasMore = data.moreDataAvailable;
      cursor = data.nextCursor;
      pages++;

      // Stop once we've gone well past cutoff
      const newest = results[results.length - 1];
      if (newest && new Date(newest.createdAt) > new Date()) break;
    }

    const tokenToSave = targetSyncToken || lastSyncToken;

    // Save to Supabase
    const { data: existing } = await supabase
      .from('pipeline_sync')
      .select('id')
      .limit(1)
      .single();

    if (existing?.id) {
      await supabase.from('pipeline_sync').update({ sync_token: tokenToSave }).eq('id', existing.id);
    } else {
      await supabase.from('pipeline_sync').insert({ sync_token: tokenToSave });
    }

    res.status(200).json({ 
      ok: true, 
      pages,
      tokenSaved: tokenToSave
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
