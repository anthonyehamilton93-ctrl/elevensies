// api/preview-email.js
// Visit /api/preview-email?type=weekly or ?type=welcome in your browser to preview.
// DELETE THIS FILE before launching publicly.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GAME_URL = 'https://playelevensies.com';

// ── Shared email chrome ────────────────────────────────────────────────────
const wrap = (inner) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">
        ${inner}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const header = `
  <tr><td align="center" style="padding:44px 40px 20px 40px;">
    <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;text-transform:uppercase;">ELEVENSIES</h1>
  </td></tr>`;

const footer = (text) => `
  <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
    <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">${text}</p>
  </td></tr>`;

const ctaBtn = (label) => `
  <tr><td align="center" style="padding:0 40px 44px 40px;">
    <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">${label}</a>
  </td></tr>`;

// ── Welcome email ──────────────────────────────────────────────────────────
function welcomePreview() {
  return wrap(`
    ${header}
    <tr><td style="padding:0 40px;text-align:center;">
      <h2 style="font-family:'Jost',sans-serif;font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Welcome, there.</h2>
      <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 28px 0;">
        Your account is set up and your stats are ready to track. The game opens every day at 11am — 10 tiles, 11 turns, one shot at the leaderboard. Your score counts even if you don't finish, so make every word count.
      </p>
    </td></tr>
    ${ctaBtn('Play Elevensies')}
    ${footer("You're receiving this because you just created an Elevensies account.")}
  `);
}

// ── Weekly roundup email ───────────────────────────────────────────────────
async function weeklyPreview() {
  // Pull real leaderboard data from Supabase so the preview is accurate
  const resultsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?select=user_id,total_score,best_word,best_word_score,played_at&game_status=eq.completed`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const results = await resultsRes.json();

  const profilesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,display_name`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profilesRes.json();
  const nameMap = {};
  if (Array.isArray(profiles)) profiles.forEach(p => { nameMap[p.id] = p.display_name; });

  // Aggregate
  const map = {};
  for (const r of (results || [])) {
    if (!map[r.user_id]) map[r.user_id] = { total: 0, count: 0, best: 0, bestWord: null, bestWordScore: 0 };
    map[r.user_id].total += r.total_score;
    map[r.user_id].count++;
    if (r.total_score > map[r.user_id].best) map[r.user_id].best = r.total_score;
    if ((r.best_word_score || 0) > map[r.user_id].bestWordScore) {
      map[r.user_id].bestWordScore = r.best_word_score;
      map[r.user_id].bestWord = r.best_word;
    }
  }

  const leaderboard = Object.entries(map)
    .filter(([, u]) => u.count >= 3)
    .map(([id, u]) => ({ name: nameMap[id] || 'Player', avg: u.total / u.count, best: u.best }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekResults = (results || []).filter(r => r.played_at > oneWeekAgo);
  const weekGames = weekResults.length;
  const topWord = weekResults.reduce((best, r) =>
    (r.best_word_score || 0) > (best?.best_word_score || 0) ? r : best, null);

  const rows = leaderboard.length > 0
    ? leaderboard.map((row, i) => `
        <tr style="border-bottom:1px solid rgba(240,192,32,0.1);">
          <td style="padding:8px 12px;font-family:'Jost',sans-serif;font-size:14px;color:#f0c020;font-weight:700;">${i + 1}</td>
          <td style="padding:8px 12px;font-family:'Jost',sans-serif;font-size:14px;color:#e2e8f0;">${row.name}</td>
          <td style="padding:8px 12px;font-family:'Jost',sans-serif;font-size:14px;color:#e2e8f0;text-align:right;">${Math.round(row.avg)} avg</td>
          <td style="padding:8px 12px;font-family:'Jost',sans-serif;font-size:14px;color:#f0c020;font-weight:700;text-align:right;">${row.best}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#8ba895;font-size:13px;font-family:'Jost',sans-serif;">Not enough games played yet to rank</td></tr>`;

  return wrap(`
    ${header}
    <tr><td style="padding:0 40px 24px;text-align:center;">
      <h2 style="font-family:'Jost',sans-serif;font-size:20px;font-weight:700;color:#ffffff;margin:0 0 8px 0;">This week's roundup</h2>
      <p style="font-family:'Jost',sans-serif;font-size:14px;color:#e2e8f0;margin:0;">
        ${weekGames} game${weekGames !== 1 ? 's' : ''} played this week${topWord?.best_word ? ` · best word: <strong style="color:#f0c020;">${topWord.best_word}</strong>` : ''}
      </p>
    </td></tr>
    <tr><td style="padding:0 24px 32px;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="border-bottom:1px solid rgba(240,192,32,0.3);">
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:11px;color:#8ba895;letter-spacing:0.1em;">#</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:11px;color:#8ba895;letter-spacing:0.1em;">PLAYER</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:11px;color:#8ba895;letter-spacing:0.1em;text-align:right;">AVG</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:11px;color:#8ba895;letter-spacing:0.1em;text-align:right;">BEST</td>
        </tr>
        ${rows}
      </table>
    </td></tr>
    ${ctaBtn('Play This Week')}
    ${footer("You're receiving this as a registered Elevensies player. Reply to unsubscribe.")}
  `);
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const type = req.query.type || 'weekly';

  let html;
  if (type === 'welcome') {
    html = welcomePreview();
  } else {
    html = await weeklyPreview();
  }

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
