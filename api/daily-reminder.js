// api/daily-reminder.js
// Runs every hour via Supabase pg_cron.
// Sends reminder emails AND push notifications at each player's local 11am.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';
const GAME_URL = 'https://playelevensies.com';
const CRON_SECRET = process.env.CRON_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = 'mailto:noreply@playelevensies.com';

// ---- Web Push (VAPID) ----
// Minimal VAPID implementation using the Web Crypto API (available in Vercel Edge/Node 18+)

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = Buffer.from(base64, 'base64');
  return new Uint8Array(raw);
}

async function sendPushNotification(subscription, payload) {
  // Use the web-push compatible approach via fetch to a push service
  // We build a minimal VAPID JWT manually
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    aud: audience,
    exp: now + 43200,
    sub: VAPID_SUBJECT,
  })).toString('base64url');

  const signingInput = `${header}.${claims}`;

  // Import private key
  const privateKeyBytes = urlBase64ToUint8Array(VAPID_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    Buffer.from(signingInput)
  );

  const jwt = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

  const headers = {
    Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
    'Content-Type': 'application/json',
    TTL: '86400',
  };

  const body = JSON.stringify(payload);

  const res = await fetch(endpoint, { method: 'POST', headers, body });
  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    console.error('Push error:', res.status, text);
    // 404/410 means subscription expired — caller should delete it
    if (res.status === 404 || res.status === 410) return 'expired';
  }
  return 'ok';
}

async function db(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
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
    @import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;700;900&display=swap');
    @font-face { font-family: 'Jost'; font-weight: 400; src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2'); }
    @font-face { font-family: 'Jost'; font-weight: 700; src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2'); }
    @font-face { font-family: 'Jost'; font-weight: 900; src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2'); }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">
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

    const eligibleIds = allProfiles.filter(p => !p.reminders_unsubscribed).map(p => p.id);
    if (!eligibleIds.length) return res.status(200).json({ message: 'No eligible players' });

    const yesterday = new Date(now); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const twoDaysAgo = new Date(yesterday); twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

    const recentGames = await db(
      `/game_results?select=user_id,played_at,total_score&game_status=eq.completed&user_id=in.(${eligibleIds.join(',')})&played_at=gte.${twoDaysAgo.toISOString()}&played_at=lt.${now.toISOString()}`
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

    // ---- Send emails ----
    const emails = playedYesterdayIds.filter(uid => emailMap[uid]).map(uid => {
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
    if (emails.length) {
      for (let i = 0; i < emails.length; i += 100) {
        await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emails.slice(i, i + 100)),
        });
        emailsSent += Math.min(100, emails.length - i);
      }
    }

    // ---- Send push notifications ----
    let pushSent = 0;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      // Fetch push subscriptions for eligible players who played yesterday
      const pushSubs = await db(
        `/push_subscriptions?select=id,user_id,subscription&user_id=in.(${playedYesterdayIds.join(',')})`
      );

      const expiredIds = [];
      for (const sub of pushSubs || []) {
        const profile = profileMap[sub.user_id];
        const streak = calcStreak(datesByUser[sub.user_id] || []);
        const body = streak >= 2
          ? `You're on a ${streak}-day streak — don't break it now! 🟨`
          : "It's 11am — time to play! 🟨";

        const result = await sendPushNotification(sub.subscription, {
          title: 'Time for Elevensies!',
          body,
          url: GAME_URL,
        });

        if (result === 'expired') expiredIds.push(sub.id);
        else pushSent++;
      }

      // Clean up expired subscriptions
      for (const id of expiredIds) {
        await db(`/push_subscriptions?id=eq.${id}`, { method: 'DELETE' });
      }
    }

    return res.status(200).json({ emailsSent, pushSent, offset: targetOffset });
  } catch (err) {
    console.error('daily-reminder error:', err);
    return res.status(500).json({ error: err.message });
  }
}
