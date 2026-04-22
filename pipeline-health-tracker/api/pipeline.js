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
    // 1. Fetch all active applications
    let applications = [];
    let appCursor = null;
    let appHasMore = true;

    while (appHasMore) {
      const body = { limit: 100, status: 'Active' };
      if (appCursor) body.cursor = appCursor;
      const data = await ashbyPost('application.list', body);
      if (!data.success) break;
      applications = applications.concat(data.results || []);
      appHasMore = data.moreDataAvailable;
      appCursor = data.nextCursor;
    }

    // 2. Get recent schedules (last 2 pages only, sorted by updatedAt)
    let schedules = [];
    let cursor = null;
    let hasMore = true;
    let pages = 0;

    while (hasMore && pages < 3) {
      const body = { limit: 100 };
      if (cursor) body.cursor = cursor;
      const data = await ashbyPost('interviewSchedule.list', body);
      if (!data.success) break;
      schedules = schedules.concat(data.results || []);
      hasMore = data.moreDataAvailable;
      cursor = data.nextCursor;
      pages++;
    }

    // 3. Build a map of applicationId -> schedule status
    const scheduleMap = {};
    for (const s of schedules) {
      if (!s.applicationId) continue;
      const existing = scheduleMap[s.applicationId];
      // Keep most recently updated schedule per application
      if (!existing || new Date(s.updatedAt) > new Date(existing.updatedAt)) {
        scheduleMap[s.applicationId] = s;
      }
    }

    // 4. Filter applications
    const waitingOnFeedback = [];
    const needsDecision = [];

    for (const app of applications) {
      const schedule = scheduleMap[app.id];
      if (!schedule) continue;

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

      if (schedule.status === 'WaitingOnFeedback') {
        waitingOnFeedback.push(formatted);
      } else if (schedule.status === 'Complete') {
        needsDecision.push(formatted);
      }
    }

    res.status(200).json({
      waitingOnFeedback,
      needsDecision,
      totalActive: applications.length,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
