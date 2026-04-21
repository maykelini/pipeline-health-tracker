module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

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
    const now = new Date();
    const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);

    let schedules = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const body = { limit: 100 };
      if (cursor) body.cursor = cursor;
      const data = await ashbyPost('interviewSchedule.list', body);
      if (!data.success) break;
      schedules = schedules.concat(data.results || []);
      hasMore = data.moreDataAvailable;
      cursor = data.nextCursor;
      const oldest = data.results?.[data.results.length - 1];
      if (oldest && new Date(oldest.updatedAt) < cutoff) break;
    }

    const waitingOnFeedback = {};
    const needsDecision = {};

    for (const schedule of schedules) {
      const events = schedule.interviewEvents || [];
      if (events.length === 0) continue;

      const pastEvents = events.filter(e => {
        const end = new Date(e.endTime || e.startTime || 0);
        return end < now && end > cutoff;
      });

      if (pastEvents.length === 0) continue;

      const appId = schedule.applicationId;
      if (!appId) continue;

      const allSubmitted = pastEvents.every(e => e.hasSubmittedFeedback === true);
      const anyMissing = pastEvents.some(e => e.hasSubmittedFeedback === false);

      if (anyMissing) {
        waitingOnFeedback[appId] = { scheduleId: schedule.id, updatedAt: schedule.updatedAt };
        delete needsDecision[appId];
      } else if (allSubmitted && !waitingOnFeedback[appId]) {
        needsDecision[appId] = { scheduleId: schedule.id, updatedAt: schedule.updatedAt };
      }
    }

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

    const appMap = {};
    for (const app of applications) appMap[app.id] = app;

    function formatApp(appId) {
      const app = appMap[appId];
      if (!app) return null;
      const recruiter = (app.hiringTeam || []).find(
        m => m.role === 'Recruiter' || m.role === 'HiringManager' || m.role === 'Coordinator'
      );
      const recruiterName = recruiter?.firstName
        ? `${recruiter.firstName} ${recruiter.lastName || ''}`.trim()
        : '—';
      const candidateName = app.candidate?.name || '—';
      const jobTitle = app.job?.title || '—';
      const stageName = app.currentInterviewStage?.title || '—';
      const stageEntered = app.currentInterviewStageEnteredAt || app.updatedAt;
      const daysInStage = stageEntered
        ? Math.floor((Date.now() - new Date(stageEntered)) / 86400000)
        : null;
      const candidateId = app.candidate?.id || '';
      return {
        id: appId,
        candidateName,
        jobTitle,
        stage: stageName,
        recruiter: recruiterName,
        daysInStage,
        ashbyUrl: candidateId ? `https://app.ashbyhq.com/candidates/${candidateId}` : null
      };
    }

    res.status(200).json({
      waitingOnFeedback: Object.keys(waitingOnFeedback).map(formatApp).filter(Boolean),
      needsDecision: Object.keys(needsDecision).map(formatApp).filter(Boolean),
      totalActive: applications.length,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
};
