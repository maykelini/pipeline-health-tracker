const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.ASHBY_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!apiKey) return res.status(500).json({ error: 'ASHBY_API_KEY not configured' });

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
    // Get saved syncToken from Supabase
    const { data: syncData } = await supabase
      .from('pipeline_sync')
      .select('id, sync_token')
      .limit(1)
      .single();

    let syncToken = syncData?.sync_token || null;
    let schedules = [];
    let hasMore = true;
    let pages = 0;

    while (hasMore && pages < 10) {
      const body = { limit: 100 };
      if (syncToken) body.syncToken = syncToken;
      const data = await ashbyPost('interviewSchedule.list', body);
      if (!data.success) break;
      schedules = schedules.concat(data.results || []);
      hasMore = data.moreDataAvailable;
      if (data.syncToken) syncToken = data.syncToken;
      pages++;
      if (!data.moreDataAvailable) break;
    }

    // Save updated syncToken to Supabase
    if (syncToken) {
      if (syncData?.id) {
        await supabase.from('pipeline_sync').update({ sync_token: syncToken }).eq('id', syncData.id);
      } else {
        await supabase.from('pipeline_sync').insert({ sync_token: syncToken });
      }
    }

    const waitingIds = {};
    const decisionIds = {};

    for (const s of schedules) {
      if (!s.applicationId) continue;
      if (s.status === 'WaitingOnFeedback') {
        waitingIds[s.applicationId] = true;
        delete decisionIds[s.applicationId];
      } else if (s.status === 'Complete' && !waitingIds[s.applicationId]) {
        decisionIds[s.applicationId] = true;
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
        ? `${recruiter.firstName} ${recruiter.lastName || ''}`.trim() : '—';
      const stageEntered = app.currentInterviewStageEnteredAt || app.updatedAt;
      const daysInStage = stageEntered
        ? Math.floor((Date.now() - new Date(stageEntered)) / 86400000) : null;
      const candidateId = app.candidate?.id || '';
      return {
        id: appId,
        candidateName: app.candidate?.name || '—',
        jobTitle: app.job?.title || '—',
        stage: app.currentInterviewStage?.title || '—',
        recruiter: recruiterName,
        daysInStage,
        ashbyUrl: candidateId ? `https://app.ashbyhq.com/candidates/${candidateId}` : null
      };
    }

    res.status(200).json({
      waitingOnFeedback: Object.keys(waitingIds).map(formatApp).filter(Boolean),
      needsDecision: Object.keys(decisionIds).map(formatApp).filter(Boolean),
      totalActive: applications.length,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
