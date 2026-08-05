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

// ===== Scaling helpers =====
// PostgREST caps a single response (1000 rows by default) and a URL can only
// hold so many UUIDs, so anything that could grow with the user base has to be
// paged or chunked rather than fetched in one go.

const PAGE_SIZE = 1000;
const ID_CHUNK = 50;          // ~37 chars per UUID — keeps URLs well under limits
const PUSH_CONCURRENCY = 25;  // parallel push sends; serial is too slow to finish

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Pages through a table until it runs out of rows.
async function dbAll(path, orderCol = 'id') {
  const sep = path.includes('?') ? '&' : '?';
  let out = [];
  let offset = 0;
  while (true) {
    const page = await db(`${path}${sep}order=${orderCol}.asc&limit=${PAGE_SIZE}&offset=${offset}`);
    if (!Array.isArray(page) || page.length === 0) break;
    out = out.concat(page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

// Splits an `id=in.(...)` filter across several requests.
async function dbByIds(basePath, column, ids, extra = '') {
  if (!ids.length) return [];
  const out = [];
  for (const batch of chunk(ids, ID_CHUNK)) {
    const sep = basePath.includes('?') ? '&' : '?';
    const rows = await dbAll(`${basePath}${sep}${column}=in.(${batch.join(',')})${extra}`);
    out.push(...rows);
  }
  return out;
}

// The admin API returns at most per_page users; walk every page.
async function listAllAuthUsers() {
  const perPage = 1000;
  let page = 1;
  const all = [];
  while (true) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!r.ok) {
      console.error('admin/users page', page, 'failed:', r.status);
      break;
    }
    const j = await r.json();
    const users = j.users || [];
    all.push(...users);
    if (users.length < perPage) break;
    page++;
    if (page > 100) break; // hard stop at 100k users
  }
  return all;
}

// Sends push in parallel batches and reports which subscriptions are dead.
async function sendPushBatch(subs, payload) {
  let sent = 0;
  const expiredIds = [];
  for (const slice of chunk(subs, PUSH_CONCURRENCY)) {
    await Promise.all(slice.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) expiredIds.push(sub.id);
        else console.error('Push error:', sub.user_id, err.message);
      }
    }));
  }
  return { sent, expiredIds };
}

// One DELETE per batch rather than one per row.
async function deleteExpiredSubs(ids) {
  for (const batch of chunk(ids, ID_CHUNK)) {
    await db(`/push_subscriptions?id=in.(${batch.join(',')})`, { method: 'DELETE' });
  }
}

// Resend caps a batch at 100 and rate-limits requests. Count what actually
// succeeded instead of assuming every batch landed.
async function sendResendBatches(emails) {
  let sent = 0;
  let failed = 0;
  const batches = chunk(emails, 100);
  for (let i = 0; i < batches.length; i++) {
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batches[i]),
      });
      if (r.ok) sent += batches[i].length;
      else {
        failed += batches[i].length;
        console.error('Resend batch failed:', r.status, await r.text());
      }
    } catch (err) {
      failed += batches[i].length;
      console.error('Resend batch error:', err.message);
    }
    if (i < batches.length - 1) await new Promise(r => setTimeout(r, 600));
  }
  return { sent, failed };
}

// Local-midnight-to-UTC for a given timezone offset in minutes.
function localDayStartUTC(now, offsetMinutes) {
  const local = new Date(now.getTime() + offsetMinutes * 60000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMinutes * 60000);
}

// Offsets run from -720 to +720; wrap anything outside that back into range.
function normaliseOffset(mins) {
  let m = mins;
  if (m > 720) m -= 1440;
  if (m < -720) m += 1440;
  return m;
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

  const pushSubs = await dbAll('/push_subscriptions?select=id,user_id,subscription');
  if (!pushSubs?.length) return { pushSent: 0, totalSubscribers: 0 };

  const pushUserIds = pushSubs.map(s => s.user_id);
  const pushProfiles = await dbByIds('/profiles?select=id,utc_offset', 'id', pushUserIds);
  const offsetMap = {};
  (pushProfiles || []).forEach(p => { offsetMap[p.id] = p.utc_offset; });

  const eligibleSubs = pushSubs.filter(sub => {
    const offset = offsetMap[sub.user_id];
    if (offset === null || offset === undefined) return targetOffset === 0 || targetOffset === 60;
    return Number(offset) === Number(targetOffset); // cast both to ensure no string/int mismatch
  });

  const { sent: pushSent, expiredIds } = await sendPushBatch(eligibleSubs, {
    title: 'Time for Elevensies!',
    body: "Today's game is open. Time to play! 🟨",
    url: GAME_URL,
  });
  await deleteExpiredSubs(expiredIds);

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
    const pushSubs = await dbAll('/push_subscriptions?select=id,user_id,subscription');
    if (!pushSubs?.length) return res.status(200).json({ catchupSent: 0, message: 'No subscribers' });

    const { sent: catchupSent, expiredIds } = await sendPushBatch(pushSubs, {
      title: 'Time for Elevensies!',
      body: "Today's game is open. Time to play! 🟨",
      url: GAME_URL,
    });
    await deleteExpiredSubs(expiredIds);
    return res.status(200).json({ catchupSent, total: pushSubs.length });
  }

  // ---- Nudge push (13:30 local) ----
  if (req.query?.nudge) {
    // A player is at 13:30 local when their offset equals 13:30 minus the
    // current UTC time. Deriving it from the real clock (rather than assuming
    // the cron fires at :30) means whole-hour, half-hour and quarter-hour
    // timezones are all reachable — you just need a cron at the matching
    // minute. See the note at the bottom of this file for which to add.
    //
    // The old version computed (13 - hour) * 60 + 30, which always ended in
    // :30 and so could never equal a whole-hour offset like 0, 60 or -480.
    const nudgeOffsetOverride = req.query.offset !== undefined ? Number(req.query.offset) : null;
    const slot = Math.round((now.getUTCHours() * 60 + now.getUTCMinutes()) / 15) * 15;
    const targetOffset = nudgeOffsetOverride !== null
      ? nudgeOffsetOverride
      : normaliseOffset(810 - slot); // 810 = 13h30m in minutes

    const pushSubs = await dbAll('/push_subscriptions?select=id,user_id,subscription');
    if (!pushSubs?.length) return res.status(200).json({ nudgeSent: 0, targetOffset });

    const pushUserIds = pushSubs.map(s => s.user_id);
    const pushProfiles = await dbByIds('/profiles?select=id,utc_offset', 'id', pushUserIds);
    const offsetMap = {};
    (pushProfiles || []).forEach(p => { offsetMap[p.id] = p.utc_offset; });

    const eligibleSubs = pushSubs.filter(sub => {
      const offset = offsetMap[sub.user_id];
      if (offset === null || offset === undefined) return false;
      return Number(offset) === Number(targetOffset);
    });

    // Nobody in this timezone — stop before building an empty in.() filter,
    // which PostgREST rejects.
    if (!eligibleSubs.length) {
      return res.status(200).json({ nudgeSent: 0, eligible: 0, targetOffset });
    }

    // "Today" means the player's local day, not the UTC day.
    const todayStart = localDayStartUTC(now, targetOffset);
    const playedToday = await dbByIds(
      '/game_results?select=user_id&game_status=eq.completed',
      'user_id',
      eligibleSubs.map(s => s.user_id),
      `&played_at=gte.${todayStart.toISOString()}`
    );
    const playedIds = new Set((playedToday || []).map(r => r.user_id));
    const unplayedSubs = eligibleSubs.filter(s => !playedIds.has(s.user_id));

    const { sent: nudgeSent, expiredIds } = await sendPushBatch(unplayedSubs, {
      title: 'Last chance — game closes at 2pm!',
      body: "You haven't played today yet. 30 minutes left! 🟨",
      url: GAME_URL,
    });
    await deleteExpiredSubs(expiredIds);
    return res.status(200).json({
      nudgeSent,
      eligible: eligibleSubs.length,
      alreadyPlayed: playedIds.size,
      targetOffset,
    });
  }

  // ---- Main: 11am push + emails ----
  const explicitOffset = req.query.offset !== undefined ? Number(req.query.offset) : null;
  const targetOffset = explicitOffset !== null
    ? explicitOffset
    : normaliseOffset((11 - now.getUTCHours()) * 60);
  const isUK = targetOffset === 60 || targetOffset === 0;

  // Send push notifications
  const pushResult = await sendPushToTimezone(targetOffset).catch(err => ({ error: err.message, pushSent: 0 }));

  // Send emails
  const offsetFilter = isUK
    ? `utc_offset=in.(0,60)&utc_offset=not.is.null`
    : `utc_offset=eq.${targetOffset}`;

  const eligibleProfiles = await dbAll(`/profiles?select=id,display_name,reminders_unsubscribed,utc_offset&${offsetFilter}`);
  if (!eligibleProfiles?.length) {
    return res.status(200).json({ message: `No profiles at offset ${targetOffset}`, ...pushResult });
  }

  let allProfiles = eligibleProfiles;
  if (isUK) {
    const nullOffsets = await dbAll('/profiles?select=id,display_name,reminders_unsubscribed,utc_offset&utc_offset=is.null');
    allProfiles = [...eligibleProfiles, ...(nullOffsets || [])];
  }

  const emailEligibleIds = allProfiles.filter(p => !p.reminders_unsubscribed).map(p => p.id);
  const allEligibleIds = allProfiles.map(p => p.id);

  const yesterday = new Date(now); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const twoDaysAgo = new Date(yesterday); twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

  const recentGames = await dbByIds(
    '/game_results?select=user_id,played_at,total_score&game_status=eq.completed',
    'user_id',
    allEligibleIds,
    `&played_at=gte.${twoDaysAgo.toISOString()}&played_at=lt.${now.toISOString()}`
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

  const allGames = await dbByIds(
    '/game_results?select=user_id,played_at&game_status=eq.completed',
    'user_id',
    playedYesterdayIds
  );

  const profileMap = {};
  allProfiles.forEach(p => { profileMap[p.id] = p; });

  const users = await listAllAuthUsers();
  const emailMap = {};
  users.forEach(u => { emailMap[u.id] = u.email; });

  const datesByUser = {};
  for (const g of allGames || []) {
    if (!datesByUser[g.user_id]) datesByUser[g.user_id] = [];
    datesByUser[g.user_id].push(g.played_at.slice(0, 10));
  }

  const emailEligibleSet = new Set(emailEligibleIds);
  const emails = playedYesterdayIds
    .filter(uid => emailEligibleSet.has(uid) && emailMap[uid])
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

  const { sent: emailsSent, failed: emailsFailed } = await sendResendBatches(emails);

  return res.status(200).json({ emailsSent, emailsFailed, offset: targetOffset, ...pushResult });
}

// ---------------------------------------------------------------------------
// NUDGE CRON SCHEDULE
//
// The nudge targets whoever is at 13:30 local time when it runs, so the cron's
// MINUTE decides which timezones it can reach. Your existing job is:
//
//   elevensies-nudge          30 * * * *    -> 23 zones (all whole-hour offsets)
//
// Two zones sit on non-whole-hour offsets and need their own jobs:
//
//   elevensies-nudge-india    0 8 * * *     -> UTC+5:30  (08:00Z = 13:30 IST)
//   elevensies-nudge-nepal    45 7 * * *    -> UTC+5:45  (07:45Z = 13:30 NPT)
//
// Both call this endpoint with ?nudge=1 and the x-cron-secret header, exactly
// like the existing job. No offset parameter needed — it's derived from the
// clock. Pass ?nudge=1&offset=X only when testing a specific timezone.
// ---------------------------------------------------------------------------
