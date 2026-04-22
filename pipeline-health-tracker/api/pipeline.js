const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase
      .from('pipeline_candidates')
      .select('*');

    if (error) throw new Error(error.message);

    const waitingOnFeedback = (data || []).filter(c => c.status === 'waiting');
    const needsDecision = (data || []).filter(c => c.status === 'decision');

    // Get total active count from Ashby
    const apiKey = process.env.ASHBY_API_KEY;
    const credentials = Buffer.from(`${apiKey}:`).toString('base64');
    const r = await fetch('https://api.ashbyhq.com/application.list', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, status: 'Active' })
    });
    const appData = await r.json();

    res.status(200).json({
      waitingOnFeedback: waitingOnFeedback.map(c => ({
        id: c.id,
        candidateName: c.candidate_name,
        jobTitle: c.job_title,
        stage: c.stage,
        recruiter: c.recruiter,
        daysInStage: c.days_in_stage,
        ashbyUrl: c.ashby_url
      })),
      needsDecision: needsDecision.map(c => ({
        id: c.id,
        candidateName: c.candidate_name,
        jobTitle: c.job_title,
        stage: c.stage,
        recruiter: c.recruiter,
        daysInStage: c.days_in_stage,
        ashbyUrl: c.ashby_url
      })),
      totalActive: appData.totalCount || 0,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
