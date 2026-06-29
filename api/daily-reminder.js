// api/daily-reminder.js
// Runs every hour via Supabase pg_cron.
// Finds players whose local time is currently 11am AND who played yesterday,
// then sends them a streak-aware reminder email with yesterday's score.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';
const GAME_URL = 'https://playelevensies.com';
const CRON_SECRET = process.env.CRON_SECRET;
// const COFFEE_URL = 'https://ko-fi.com/YOUR_HANDLE'; // add when ready

async function db(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">

        <tr><td align="center" style="padding:44px 40px 20px 40px;">
          <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;text-transform:uppercase;">ELEVENSIES</h1>
        </td></tr>

        <tr><td style="padding:0 40px;text-align:center;">
          <h2 style="font-family:'Jost',sans-serif;font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Time for Elevensies!</h2>
          <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 12px 0;">
            ${greeting} today's game is open right now. You've got one hour.
          </p>
          <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 20px 0;">
            ${streakLine}
          </p>
        </td></tr>

        ${yesterdayScore !== null ? `
        <!-- Yesterday's score challenge -->
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
          <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">Play Now</a>
        </td></tr>

        <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">
            You're getting this because you played yesterday.
            <a href="${GAME_URL}/api/unsubscribe?uid=${userId}" style="color:#8ba895;text-decoration:underline;">Stop reminders</a>
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
  const yesterday = localDateStr(yest);
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  let prev = new Date(unique[0] + 'T12:00:00');
  for (let i = 1; i < unique.length; i++) {
    const expected = new Date(prev); expected.setDate(expected.getDate() - 1);
    if (unique[i] === localDateStr(expected)) { streak++; prev = expected; } else break;
  }
  return streak;
}

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (CRON_SECRET && secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date();
    const targetOffset = (11 - now.getUTCHours()) * 60;

    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dayBefore = new Date(yesterday);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

    const [recentGames, nullOffsetGames] = await Promise.all([
      db(`/game_results?select=user_id,played_at,utc_offset,total_score&game_status=eq.completed&utc_offset=eq.${targetOffset}&played_at=gte.${dayBefore.toISOString()}&played_at=lt.${now.toISOString()}`),
      targetOffset === 60 ? db(`/game_results?select=user_id,played_at,utc_offset,total_score&game_status=eq.completed&utc_offset=is.null&played_at=gte.${dayBefore.toISOString()}&played_at=lt.${now.toISOString()}`) : Promise.resolve([])
    ]);

    const allRecentGames = [...(recentGames || []), ...(nullOffsetGames || [])];

    if (allRecentGames.length === 0) {
      return res.status(200).json({ message: `No players at offset ${targetOffset} played yesterday` });
    }

    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    // Get yesterday's game per user (most recent)
    const yesterdayByUser = {};
    for (const g of allRecentGames) {
      if (new Date(g.played_at) < todayStart) {
        if (!yesterdayByUser[g.user_id] || new Date(g.played_at) > new Date(yesterdayByUser[g.user_id].played_at)) {
          yesterdayByUser[g.user_id] = g;
        }
      }
    }

    const playedYesterdayIds = Object.keys(yesterdayByUser);
    if (playedYesterdayIds.length === 0) return res.status(200).json({ message: 'No eligible players' });

    const allGames = await db(`/game_results?select=user_id,played_at&game_status=eq.completed&user_id=in.(${playedYesterdayIds.join(',')})`);
    const profiles = await db(`/profiles?select=id,display_name,email_unsubscribed&id=in.(${playedYesterdayIds.join(',')})`);
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const { users } = await authRes.json();
    const emailMap = {};
    (users || []).forEach(u => { emailMap[u.id] = u.email; });

    const datesByUser = {};
    for (const g of allGames) {
      if (!datesByUser[g.user_id]) datesByUser[g.user_id] = [];
      datesByUser[g.user_id].push(g.played_at.slice(0, 10));
    }

    const emails = playedYesterdayIds
      .filter(uid => !profileMap[uid]?.email_unsubscribed && emailMap[uid])
      .map(uid => {
        const profile = profileMap[uid];
        const name = profile?.display_name || null;
        const streak = calcStreak(datesByUser[uid] || []);
        const yesterdayScore = yesterdayByUser[uid]?.total_score ?? null;
        return {
          from: FROM_EMAIL,
          to: emailMap[uid],
          subject: "Time for Elevensies! 🟨",
          html: reminderHTML(name, streak, yesterdayScore, uid),
        };
      });

    if (emails.length === 0) return res.status(200).json({ message: 'No emails to send' });

    for (let i = 0; i < emails.length; i += 100) {
      await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emails.slice(i, i + 100)),
      });
    }

    return res.status(200).json({ sent: emails.length, offset: targetOffset });
  } catch (err) {
    console.error('daily-reminder error:', err);
    return res.status(500).json({ error: err.message });
  }
}
