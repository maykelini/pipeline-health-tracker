module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

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
    const updatedAfter = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch active applications updated in last 45 days
    let applications = [];
    let appCursor = null;
    let appHasMore = true;

    while (appHasMore) {
      const body = { limit: 100, status: 'Active', updatedAfter };
      if (appCursor) body.cursor = appCursor;
      const data = await ashbyPost('application.list', body);
      if (!data.success) break;
      applications = applications.concat(data.results || []);
      appHasMore = data.moreDataAvailable;
      appCursor = data.nextCursor;
    }

    // 2. For each application, fetch its schedule
    const waitingOnFeedback = [];
    const needsDecision = [];

    for (const app of applications) {
      const schedData = await ashbyPost('interviewSchedule.list', { applicationId: app.id });
      const schedules = schedData.results || [];
      if (schedules.length === 0) continue;

      // Get most recently updated schedule
      const latest = schedules.sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      )[0];

      if (latest.status !== 'WaitingOnFeedback' && latest.status !== 'Complete') continue;

      const recruiter = (app.hiringTeam || []).find(
        m => m.role === 'Recruiter' || m.role === 'HiringManager' || m.role === 'Coordinator'
      );
      const recruiterName = recruiter?.firstName
        ? `${recruiter.firstName} ${recruiter.lastName || ''}`.trim() : '—';
      const stageEntered = app.currentInterviewStageEnteredAt || app.updatedAt;
      const daysInStage = stageEntered
        ? Math.floor((Date.now() - new Date(stageEntered)) / 86400000) : null;
      const candidateId = app.candidate?.id || '';

      const formatted = {
        id: app.id,
        candidateName: app.candidate?.name || '—',
        jobTitle: app.job?.title || '—',
        stage: app.currentInterviewStage?.title || '—',
        recruiter: recruiterName,
        daysInStage,
        ashbyUrl: candidateId ? `https://app.ashbyhq.com/candidates/${candidateId}` : null
      };

      if (latest.status === 'WaitingOnFeedback') {
        waitingOnFeedback.push(formatted);
      } else {
        needsDecision.push(formatted);
      }
    }

    // 3. Get total active count
    const totalData = await ashbyPost('application.list', { limit: 1, status: 'Active' });

    res.status(200).json({
      waitingOnFeedback,
      needsDecision,
      totalActive: totalData.totalCount || applications.length,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
