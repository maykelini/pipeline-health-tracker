module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.ASHBY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ASHBY_API_KEY not configured' });

  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json'
  };

  async function ashbyPost(endpoint, body = {}) {
    const r = await fetch(`https://api.ashbyhq.com/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    return r.json();
  }

  try {
    const appData = await ashbyPost('application.list', { limit: 3, status: 'Active' });
    const sample = appData.results ? appData.results[0] : null;

    const schedData = await ashbyPost('interviewSchedule.list', { limit: 3 });
    const schedSample = schedData.results ? schedData.results[0] : null;

    let feedbackSample = null;
    if (sample) {
      const fbData = await ashbyPost('applicationFeedback.list', { applicationId: sample.id });
      feedbackSample = fbData;
    }

    res.status(200).json({
      applicationSample: sample,
      applicationKeys: sample ? Object.keys(sample) : [],
      scheduleSample: schedSample,
      scheduleKeys: schedSample ? Object.keys(schedSample) : [],
      feedbackSample,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
