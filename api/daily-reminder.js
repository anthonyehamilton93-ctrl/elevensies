// api/daily-reminder.js
// Sends reminder emails AND push notifications at each player's local 11am.
// Uses web-push npm package for VAPID push.

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

function reminderHTML(name, streak, yesterdayScore, userId) {
  const greeting = name && !name.startsWith('user') ? `Hey ${name},` : 'Hey,';
  const streakLine = streak >= 2
    ? `You're on a <strong style="color:#f0c020;">${streak}-day streak</strong> — don't break it now.`
    : `Today's your chance to start a streak.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Time for Elevensies!</title>
  <style>
    @font-face { font-family: 'Jost'; font-weight: 400; src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2'); }
    @font-face { font-family: 'Jost'; font-weight: 700; src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2'); }
    @font-face { font-family: 'Jost'; font-weight: 900; src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2'); }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;">
        <tr><td align="center" style="padding:44px 40px 20px 40px;">
          <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;">ELEVENSIES</h1>
        </td></tr>
        <tr><td style="padding:0 40px;text-align:center;">
          <h2 style="font-family:'Jost',sans-serif;font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Time for Elevensies!</h2>
          <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 12px 0;">${greeting} today's game is open right now. You've got three hours.</p>
          <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 20px 0;">${streakLine}</p>
        </td></tr>
        ${yesterdayScore !== null ? `
        <tr><td style="padding:0 24px 24px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr><td style="background-color:#114b29;padding:16px 20px;text-align:center;border-radius:8px;">
              <p style="font-family:'Jost',sans-serif;font-size:12px;letter-spacing:0.12em;color:#8ba895;margin:0 0 6px 0;">YESTERDAY'S SCORE</p>
              <p style="font-family:'Jost',sans-serif;font-size:48px;font-weight:900;color:#f0c020;margin:0 0 4px 0;line-height:1;">${yesterdayScore}</p>
              <p style="font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;margin:0;opacity:0.8;">Can you beat it?</p>
            </td></tr>
          </table>
        </td></tr>` : ''}
        <tr><td align="center" style="padding:0 40px 16px 40px;">
          <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;text-transform:uppercase;">Play Now</a>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">
            You're getting this because you played yesterday.
            <a href="${GAME_URL}/api/unsubscribe-reminders?uid=${userId}" style="color:#8ba895;text-decoration:underline;">Stop reminders</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function calcStreak(dates) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const localDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = localDateStr(new Date());
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (unique[0] !== today && unique[0] !== localDateStr(yest)) return 0;
  let streak = 1, prev = new Date(unique[0] + 'T12:00:00');
  for (let i = 1; i < unique.length; i++) {
    const expected = new Date(prev); expected.setDate(expected.getDate() - 1);
    if (unique[i] === localDateStr(expected)) { streak++; prev = expected; } else break;
  }
  return streak;
}

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (CRON_SECRET && secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails('mailto:noreply@playelevensies.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }

  // Test push
  const testUid = req.query?.test;
  if (testUid) {
    const subs = await db(`/push_subscriptions?select=id,user_id,subscription&user_id=eq.${testUid}`);
    console.log('push_subscriptions for user:', JSON.stringify(subs));
    if (!subs?.length) {
      const all = await db(`/push_subscriptions?select=user_id`);
      return res.status(404).json({ error: 'No push subscription found for that user ID', totalInTable: all?.length ?? 0 });
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

  // ---- Push notifications — timezone-aware, same as emails ----
  let pushSent = 0;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      const now = new Date();
      const targetOffset = (11 - now.getUTCHours()) * 60;

      // Fetch all push subscriptions
      const pushSubs = await db(`/push_subscriptions?select=id,user_id,subscription`);
      if (pushSubs?.length) {
        // Fetch profiles for these users to get their timezone offset
        const pushUserIds = pushSubs.map(s => s.user_id);
        const pushProfiles = await db(`/profiles?select=id,utc_offset&id=in.(${pushUserIds.join(',')})`);
        const offsetMap = {};
        (pushProfiles || []).forEach(p => { offsetMap[p.id] = p.utc_offset; });

        // Filter to users whose local time is currently 11am
        const eligibleSubs = pushSubs.filter(sub => {
          const offset = offsetMap[sub.user_id];
          if (offset === null || offset === undefined) {
            // No offset stored — default to UK (0 or 60)
            return targetOffset === 0 || targetOffset === 60;
          }
          return offset === targetOffset;
        });

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
      }
    } catch (err) {
      console.error('Push batch error:', err.message);
    }
  }

  try {
    const now = new Date();
    const targetOffset = (11 - now.getUTCHours()) * 60;
    const isUK = targetOffset === 60 || targetOffset === 0;
    const offsetFilter = isUK
      ? `utc_offset=in.(0,60)&utc_offset=not.is.null`
      : `utc_offset=eq.${targetOffset}`;

    const eligibleProfiles = await db(`/profiles?select=id,display_name,reminders_unsubscribed,utc_offset&${offsetFilter}`);
    if (!eligibleProfiles?.length) return res.status(200).json({ message: `No profiles at offset ${targetOffset}` });

    let allProfiles = eligibleProfiles;
    if (isUK) {
      const nullOffsets = await db(`/profiles?select=id,display_name,reminders_unsubscribed,utc_offset&utc_offset=is.null`);
      allProfiles = [...eligibleProfiles, ...(nullOffsets || [])];
    }

    const allEligibleIds = allProfiles.map(p => p.id);
    const emailEligibleIds = allProfiles.filter(p => !p.reminders_unsubscribed).map(p => p.id);

    const yesterday = new Date(now); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const twoDaysAgo = new Date(yesterday); twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

    // Get recent games for all eligible players (emails + push may differ)
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
    if (!playedYesterdayIds.length) return res.status(200).json({ message: 'No eligible players played yesterday' });

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

    // ---- Send emails (only to email-opted-in players who played yesterday) ----
    const emails = playedYesterdayIds
      .filter(uid => emailEligibleIds.includes(uid) && emailMap[uid])
      .map(uid => {
        const profile = profileMap[uid];
        const streak = calcStreak(datesByUser[uid] || []);
        const yesterdayScore = yesterdayByUser[uid]?.total_score ?? null;
        return {
          from: FROM_EMAIL,
          to: emailMap[uid],
          subject: 'Time for Elevensies! 🟨',
          html: reminderHTML(profile?.display_name || null, streak, yesterdayScore, uid),
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

    return res.status(200).json({ emailsSent, pushSent, offset: targetOffset });
  } catch (err) {
    console.error('daily-reminder error:', err);
    return res.status(500).json({ error: err.message });
  }
}
