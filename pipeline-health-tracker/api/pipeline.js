export default async function handler(req, res) {
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
    // 1. Fetch all active applications (paginated)
    let applications = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const body = { limit: 100, status: 'Active' };
      if (cursor) body.cursor = cursor;
      const data = await ashbyPost('application.list', body);
      if (!data.success) throw new Error(JSON.stringify(data.errors || data));
      applications = applications.concat(data.results || []);
      hasMore = data.moreDataAvailable;
      cursor = data.nextCursor;
    }

    // 2. For each application, fetch interview schedule to determine stage
    // We'll use the applicationFeedback to check waiting vs needs decision
    const waitingOnFeedback = [];
    const needsDecision = [];

    // Batch: get all interview schedules
    const schedData = await ashbyPost('interviewSchedule.list', { limit: 100 });
    const schedules = schedData.success ? (schedData.results || []) : [];

    // Map applicationId -> schedules
    const schedByApp = {};
    for (const s of schedules) {
      if (!schedByApp[s.applicationId]) schedByApp[s.applicationId] = [];
      schedByApp[s.applicationId].push(s);
    }

    for (const app of applications) {
      // Skip if no interview stages
      const stageType = (app.currentInterviewPlan?.name || app.currentStageDetails?.interviewPlanStage?.type || '').toLowerCase();
      const stageName = app.currentInterviewPlan?.name || app.applicationStage?.title || app.stage?.title || '';

      // Check feedback status via the application's feedbackStatus field (if available)
      // Ashby native: app.feedbackState or similar
      const feedbackState = app.feedbackState || app.feedbackStatus || '';

      // Use Ashby's own fields when available
      if (feedbackState === 'WaitingOnFeedback' || feedbackState === 'waiting_on_feedback') {
        waitingOnFeedback.push(formatApp(app));
      } else if (feedbackState === 'NeedsDecision' || feedbackState === 'needs_decision') {
        needsDecision.push(formatApp(app));
      } else {
        // Fallback: check if application has scheduled interviews without feedback
        const appSchedules = schedByApp[app.id] || [];
        const hasPastInterview = appSchedules.some(s => {
          const end = new Date(s.scheduledEnd || s.endTime || 0);
          return end < new Date();
        });

        if (hasPastInterview) {
          // Get feedback for this application
          const fbData = await ashbyPost('applicationFeedback.list', { applicationId: app.id });
          const feedbacks = fbData.success ? (fbData.results || []) : [];
          const hasSubmittedFeedback = feedbacks.some(f => f.status === 'Submitted' || f.submittedAt);

          if (!hasSubmittedFeedback) {
            waitingOnFeedback.push(formatApp(app));
          } else {
            // Has feedback but still in same stage = Needs Decision
            needsDecision.push(formatApp(app));
          }
        }
      }
    }

    res.status(200).json({
      waitingOnFeedback,
      needsDecision,
      totalActive: applications.length,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Pipeline API error:', err);
    res.status(500).json({ error: err.message });
  }
}

function formatApp(app) {
  const recruiter = app.hiringTeam?.find(m => m.role === 'HiringManager' || m.role === 'Recruiter');
  const recruiterName = recruiter?.name || app.recruiterName || app.owner?.name || '—';
  const candidateName = app.candidate?.name || app.candidateName || '—';
  const jobTitle = app.job?.title || app.jobTitle || '—';
  const stageName = app.currentInterviewPlan?.name || app.applicationStage?.title || app.stage?.title || '—';
  const createdAt = app.createdAt || app.appliedAt;
  const daysInStage = app.currentStageEnteredAt
    ? Math.floor((Date.now() - new Date(app.currentStageEnteredAt)) / 86400000)
    : null;

  return {
    id: app.id,
    candidateName,
    jobTitle,
    stage: stageName,
    recruiter: recruiterName,
    daysInStage,
    createdAt,
    ashbyUrl: app.id ? `https://app.ashbyhq.com/candidates/${app.candidateId || ''}` : null
  };
}
