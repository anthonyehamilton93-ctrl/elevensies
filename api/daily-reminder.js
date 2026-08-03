import webpush from 'web-push';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';
const GAME_URL = 'https://playelevensies.com';
const CRON_SECRET = process.env.CRON_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

async function db(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
    ...options,
  });
  if (options.method === 'DELETE') return res.ok;
  return res.json();
}

function calcStreak(dates) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const localDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (unique[0] !== localDateStr(new Date()) && unique[0] !== localDateStr(yest)) return 0;
  let streak = 1, prev = new Date(unique[0] + 'T12:00:00');
  for (let i = 1; i < unique.length; i++) {
    const expected = new Date(prev); expected.setDate(expected.getDate() - 1);
    if (unique[i] === localDateStr(expected)) { streak++; prev = expected; } else break;
  }
  return streak;
}

function reminderHTML(name, streak, yesterdayScore, userId) {
  const greeting = name && !name.startsWith('user') ? `Hey ${name},` : 'Hey,';
  const streakLine = streak >= 2
    ? `You're on a <strong style="color:#f0c020;">${streak}-day streak</strong> — don't break it now.`
    : `Today's your chance to start a streak.`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <style>@font-face{font-family:'Jost';font-weight:700;src:url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2')}</style>
  </head><body style="margin:0;padding:0;background:#1a6b3c;font-family:'Jost',sans-serif;">
  <table width="100%" style="background:#1a6b3c;padding:40px 20px;"><tr><td align="center">
  <table width="100%" style="max-width:440px;background:#155c33;">
    <tr><td align="center" style="padding:44px 40px 20px">
      <h1 style="font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;">ELEVENSIES</h1>
    </td></tr>
    <tr><td style="padding:0 40px;text-align:center;">
      <h2 style="font-size:22px;color:#fff;margin:0 0 12px">Time for Elevensies!</h2>
      <p style="font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 12px">${greeting} today's game is open right now.</p>
      <p style="font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 20px">${streakLine}</p>
    </td></tr>
    ${yesterdayScore !== null ? `<tr><td style="padding:0 24px 24px"><table width="100%"><tr>
      <td style="background:#114b29;padding:16px;text-align:center">
        <p style="font-size:12px;letter-spacing:0.12em;color:#8ba895;margin:0 0 6px">YESTERDAY'S SCORE</p>
        <p style="font-size:48px;font-weight:900;color:#f0c020;margin:0 0 4px;line-height:1">${yesterdayScore}</p>
        <p style="font-size:13px;color:#e2e8f0;margin:0;opacity:0.8">Can you beat it?</p>
      </td></tr></table></td></tr>` : ''}
    <tr><td align="center" style="padding:0 40px 16px">
      <a href="${GAME_URL}" style="display:inline-block;background:#f0c020;color:#155c33;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;text-transform:uppercase;">Play Now</a>
    </td></tr>
    <tr><td style="padding:20px 40px;background:#114b29;text-align:center">
      <p style="font-size:12px;color:#8ba895;margin:0">
        You're getting this because you played yesterday.
        <a href="${GAME_URL}/api/unsubscribe-reminders?uid=${userId}" style="color:#8ba895;text-decoration:underline;">Stop reminders</a>
      </p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function sendPushToTimezone(targetOffset) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return { pushSent: 0, error: 'VAPID not configured' };

  const pushSubs = await db(`/push_subscriptions?select=id,user_id,subscription`);
  if (!pushSubs?.length) return { pushSent: 0, totalSubscribers: 0 };

  const pushUserIds = pushSubs.map(s => s.user_id);
  const pushProfiles = await db(`/profiles?select=id,utc_offset&id=in.(${pushUserIds.join(',')})`);
  const offsetMap = {};
  (pushProfiles || []).forEach(p => { offsetMap[p.id] = p.utc_offset; });

  const eligibleSubs = pushSubs.filter(sub => {
    const offset = offsetMap[sub.user_id];
    if (offset === null || offset === undefined) return targetOffset === 0 || targetOffset === 60;
    return Number(offset) === Number(targetOffset); // cast both to ensure no string/int mismatch
  });

  let pushSent = 0;
  const expiredIds = [];
  for (const sub of eligibleSubs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({
        title: 'Time for Elevensies!',
        body: "Today's game is open. Time to play! 🟨",
        url: GAME_URL,
      }));
      pushSent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) expiredIds.push(sub.id);
      else console.error('Push error:', sub.user_id, err.message);
    }
  }
  for (const id of expiredIds) await db(`/push_subscriptions?id=eq.${id}`, { method: 'DELETE' });

  return { pushSent, totalSubscribers: pushSubs.length, eligible: eligibleSubs.length, targetOffset };
}

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (CRON_SECRET && secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails('mailto:noreply@playelevensies.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }

  const now = new Date();

  // ---- Test push ----
  const testUid = req.query?.test;
  if (testUid) {
    const subs = await db(`/push_subscriptions?select=id,user_id,subscription&user_id=eq.${testUid}`);
    if (!subs?.length) {
      const all = await db(`/push_subscriptions?select=user_id`);
      return res.status(404).json({ error: 'No subscription found', totalInTable: all?.length ?? 0 });
    }
    try {
      await webpush.sendNotification(subs[0].subscription, JSON.stringify({
        title: 'Time for Elevensies!',
        body: 'Test notification — push is working! 🟨',
        url: GAME_URL,
      }));
      return res.status(200).json({ ok: true, message: 'Test push sent' });
    } catch (err) {
      return res.status(500).json({ error: err.message, statusCode: err.statusCode, body: err.body });
    }
  }

  // ---- Push-only route ----
  if (req.query?.push) {
    const explicitOffset = req.query.offset !== undefined ? Number(req.query.offset) : null;
    const now2 = new Date();
    const targetOffset2 = explicitOffset !== null ? explicitOffset : (11 - now2.getUTCHours()) * 60;
    const result = await sendPushToTimezone(targetOffset2);
    return res.status(200).json(result);
  }

  // ---- Catch-up push ----
  if (req.query?.catchup) {
    const pushSubs = await db(`/push_subscriptions?select=id,user_id,subscription`);
    if (!pushSubs?.length) return res.status(200).json({ catchupSent: 0, message: 'No subscribers' });

    let catchupSent = 0;
    const expiredIds = [];
    for (const sub of pushSubs) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          title: 'Time for Elevensies!',
          body: "Today's game is open. Time to play! 🟨",
          url: GAME_URL,
        }));
        catchupSent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) expiredIds.push(sub.id);
        else console.error('Catchup push error:', sub.user_id, err.message);
      }
    }
    for (const id of expiredIds) await db(`/push_subscriptions?id=eq.${id}`, { method: 'DELETE' });
    return res.status(200).json({ catchupSent, total: pushSubs.length });
  }

  // ---- Nudge push (13:30 local) ----
  if (req.query?.nudge) {
    const targetOffset = (13 - now.getUTCHours()) * 60 + 30;
    const pushSubs = await db(`/push_subscriptions?select=id,user_id,subscription`);
    if (!pushSubs?.length) return res.status(200).json({ nudgeSent: 0 });

    const pushUserIds = pushSubs.map(s => s.user_id);
    const pushProfiles = await db(`/profiles?select=id,utc_offset&id=in.(${pushUserIds.join(',')})`);
    const offsetMap = {};
    (pushProfiles || []).forEach(p => { offsetMap[p.id] = p.utc_offset; });

    const eligibleSubs = pushSubs.filter(sub => {
      const offset = offsetMap[sub.user_id];
      return offset === targetOffset;
    });

    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
    const playedToday = await db(
      `/game_results?select=user_id&game_status=eq.completed&user_id=in.(${eligibleSubs.map(s=>s.user_id).join(',')})&played_at=gte.${todayStart.toISOString()}`
    );
    const playedIds = new Set((playedToday || []).map(r => r.user_id));
    const unplayedSubs = eligibleSubs.filter(s => !playedIds.has(s.user_id));

    let nudgeSent = 0;
    const expiredIds = [];
    for (const sub of unplayedSubs) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          title: 'Last chance — game closes at 2pm!',
          body: "You haven't played today yet. 30 minutes left! 🟨",
          url: GAME_URL,
        }));
        nudgeSent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) expiredIds.push(sub.id);
      }
    }
    for (const id of expiredIds) await db(`/push_subscriptions?id=eq.${id}`, { method: 'DELETE' });
    return res.status(200).json({ nudgeSent, eligible: eligibleSubs.length, alreadyPlayed: playedIds.size });
  }

  // ---- Main: 11am push + emails ----
  const explicitOffset = req.query.offset !== undefined ? Number(req.query.offset) : null;
  const targetOffset = explicitOffset !== null ? explicitOffset : (11 - now.getUTCHours()) * 60;
  const isUK = targetOffset === 60 || targetOffset === 0;

  // Send push notifications
  const pushResult = await sendPushToTimezone(targetOffset).catch(err => ({ error: err.message, pushSent: 0 }));

  // Send emails
  const offsetFilter = isUK
    ? `utc_offset=in.(0,60)&utc_offset=not.is.null`
    : `utc_offset=eq.${targetOffset}`;

  const eligibleProfiles = await db(`/profiles?select=id,display_name,reminders_unsubscribed,utc_offset&${offsetFilter}`);
  if (!eligibleProfiles?.length) {
    return res.status(200).json({ message: `No profiles at offset ${targetOffset}`, ...pushResult });
  }

  let allProfiles = eligibleProfiles;
  if (isUK) {
    const nullOffsets = await db(`/profiles?select=id,display_name,reminders_unsubscribed,utc_offset&utc_offset=is.null`);
    allProfiles = [...eligibleProfiles, ...(nullOffsets || [])];
  }

  const emailEligibleIds = allProfiles.filter(p => !p.reminders_unsubscribed).map(p => p.id);
  const allEligibleIds = allProfiles.map(p => p.id);

  const yesterday = new Date(now); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const twoDaysAgo = new Date(yesterday); twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

  const recentGames = await db(
    `/game_results?select=user_id,played_at,total_score&game_status=eq.completed&user_id=in.(${allEligibleIds.join(',')})&played_at=gte.${twoDaysAgo.toISOString()}&played_at=lt.${now.toISOString()}`
  );

  const yesterdayByUser = {};
  for (const g of recentGames || []) {
    if (new Date(g.played_at) < todayStart) {
      if (!yesterdayByUser[g.user_id] || new Date(g.played_at) > new Date(yesterdayByUser[g.user_id].played_at)) {
        yesterdayByUser[g.user_id] = g;
      }
    }
  }

  const playedYesterdayIds = Object.keys(yesterdayByUser);
  if (!playedYesterdayIds.length) {
    return res.status(200).json({ message: 'No eligible players played yesterday', ...pushResult });
  }

  const allGames = await db(
    `/game_results?select=user_id,played_at&game_status=eq.completed&user_id=in.(${playedYesterdayIds.join(',')})`
  );

  const profileMap = {};
  allProfiles.forEach(p => { profileMap[p.id] = p; });

  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  const { users } = await authRes.json();
  const emailMap = {};
  (users || []).forEach(u => { emailMap[u.id] = u.email; });

  const datesByUser = {};
  for (const g of allGames || []) {
    if (!datesByUser[g.user_id]) datesByUser[g.user_id] = [];
    datesByUser[g.user_id].push(g.played_at.slice(0, 10));
  }

  const emails = playedYesterdayIds
    .filter(uid => emailEligibleIds.includes(uid) && emailMap[uid])
    .map(uid => {
      const profile = profileMap[uid];
      const streak = calcStreak(datesByUser[uid] || []);
      return {
        from: FROM_EMAIL,
        to: emailMap[uid],
        subject: 'Time for Elevensies! 🟨',
        html: reminderHTML(profile?.display_name || null, streak, yesterdayByUser[uid]?.total_score ?? null, uid),
      };
    });

  let emailsSent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails.slice(i, i + 100)),
    });
    emailsSent += Math.min(100, emails.length - i);
  }

  return res.status(200).json({ emailsSent, offset: targetOffset, ...pushResult });
}
