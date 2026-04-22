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
    const appId = '4975a629-6439-4e6b-af5b-fdd25695ceeb';

    const schedules = await ashbyPost('interviewSchedule.list', { applicationId: appId });
    const feedback = await ashbyPost('applicationFeedback.list', { applicationId: appId });

    res.status(200).json({ schedules, feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
