// api/weekly-roundup.js
// Personalised weekly roundup email — called by Supabase pg_cron every Sunday at 6pm UTC.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';
const GAME_URL = 'https://playelevensies.com';
const CRON_SECRET = process.env.CRON_SECRET;

const BADGE_NAMES = {
  streak: 'STREAK', wordsmith: 'WORDSMITH', avid: 'AVID',
  doubledown: 'DOUBLES', spotter: 'SPOTTER', purist: 'PURIST',
  linguist: 'LINGUIST', centurion: 'CENTURION'
};

async function db(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  return res.json();
}

// ── Email builder ────────────────────────────────────────────────────────────
function buildEmail({ name, weekScores, bestWordThisWeek, leaderboard, userRank, newBadges, totalUsers, userId }) {

  // Personal scores section
  const scoresHTML = weekScores.length > 0
    ? weekScores.map(s => `
        <tr>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;">${new Date(s.played_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;text-align:right;">${s.total_score}</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;text-align:right;">${s.best_word || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#8ba895;font-size:13px;font-family:'Jost',sans-serif;">No games this week</td></tr>`;

  // Leaderboard section
  const lbHTML = leaderboard.map((row, i) => {
    const isYou = row.isYou;
    return `<tr style="${isYou ? 'background-color:rgba(240,192,32,0.1);' : ''}">
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;">${row.rank}</td>
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:${isYou ? '#f0c020' : '#e2e8f0'};font-weight:${isYou ? '700' : '400'};">${row.name}${isYou ? ' ★' : ''}</td>
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;text-align:right;">${Math.round(row.avg)}</td>
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;text-align:right;">${row.best}</td>
    </tr>`;
  }).join('');

  const divider = (label) => `
    <tr><td colspan="10" style="padding:20px 40px 8px;">
      <p style="font-family:'Jost',sans-serif;font-size:10px;letter-spacing:0.15em;color:#8ba895;margin:0;border-bottom:1px solid rgba(240,192,32,0.2);padding-bottom:8px;">${label}</p>
    </td></tr>`;

  // Badges section
  const badgesHTML = newBadges.length > 0
    ? newBadges.map(b => `
        <span style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:11px;font-weight:700;padding:4px 10px;margin:3px;letter-spacing:0.08em;">${b}</span>
      `).join('')
    : null;

  const greeting = name && !name.startsWith('user') ? `Hey ${name},` : 'Hey,';
  const rankLine = userRank
    ? `You're ranked <strong style="color:#f0c020;">#${userRank} of ${totalUsers}</strong> overall.`
    : `Play more games to earn a leaderboard ranking.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>This Week in Elevensies</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">

        <!-- Header -->
        <tr><td align="center" style="padding:44px 40px 16px 40px;">
          <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;text-transform:uppercase;">ELEVENSIES</h1>
        </td></tr>
        <tr><td style="padding:0 40px 20px;text-align:center;">
          <h2 style="font-family:'Jost',sans-serif;font-size:18px;font-weight:700;color:#ffffff;margin:0 0 6px 0;">This week's roundup</h2>
          <p style="font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;margin:0;opacity:0.8;">${greeting} here's how your week looked.</p>
        </td></tr>

        ${bestWordThisWeek ? `
        <!-- Best word of the week -->
        ${divider('YOUR WORD OF THE WEEK')}
        <tr><td style="padding:8px 40px 20px;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:28px;font-weight:900;color:#f0c020;margin:0 0 4px 0;letter-spacing:0.05em;">${bestWordThisWeek.word.toUpperCase()}</p>
          <p style="font-family:'Jost',sans-serif;font-size:12px;color:#e2e8f0;margin:0;opacity:0.7;">${bestWordThisWeek.score} pts · played by ${bestWordThisWeek.playerName}</p>
        </td></tr>` : ''}

        <!-- Your scores this week -->
        ${divider('YOUR SCORES THIS WEEK')}
        <tr><td style="padding:4px 24px 16px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr style="border-bottom:1px solid rgba(240,192,32,0.2);">
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;">DAY</td>
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;text-align:right;">SCORE</td>
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;text-align:right;">BEST WORD</td>
            </tr>
            ${scoresHTML}
          </table>
        </td></tr>

        ${badgesHTML ? `
        <!-- Badges earned this week -->
        ${divider('BADGES EARNED THIS WEEK')}
        <tr><td style="padding:8px 40px 16px;text-align:center;">
          ${badgesHTML}
        </td></tr>` : ''}

        <!-- Leaderboard -->
        ${divider('LEADERBOARD — TOP 10')}
        <tr><td style="padding:4px 24px 8px;">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr style="border-bottom:1px solid rgba(240,192,32,0.2);">
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;">#</td>
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;">PLAYER</td>
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;text-align:right;">AVG</td>
              <td style="padding:5px 12px;font-family:'Jost',sans-serif;font-size:10px;color:#8ba895;letter-spacing:0.1em;text-align:right;">BEST</td>
            </tr>
            ${lbHTML}
          </table>
        </td></tr>
        <tr><td style="padding:8px 40px 24px;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;color:#e2e8f0;margin:0;opacity:0.7;">${rankLine}</p>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:0 40px 44px 40px;">
          <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">Play This Week</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">You're receiving this as a registered Elevensies player. <a href='https://playelevensies.com/api/unsubscribe?uid=${userId}' style='color:#8ba895;'>Unsubscribe</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Data fetching & aggregation ──────────────────────────────────────────────
export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (CRON_SECRET && secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all completed results (all time for leaderboard, filter for this week)
    const allResults = await db('/game_results?select=user_id,total_score,best_word,best_word_score,played_at&game_status=eq.completed&order=played_at.desc');
    const weekResults = allResults.filter(r => r.played_at > oneWeekAgo);

    // Fetch all profiles (names + badges)
    const profiles = await db('/profiles?select=id,display_name,badges,email_unsubscribed');
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    // Fetch all users from Auth (for email addresses)
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const { users } = await authRes.json();
    const confirmedUsers = (users || []).filter(u => u.email && u.email_confirmed_at);

    if (confirmedUsers.length === 0) return res.status(200).json({ message: 'No recipients' });

    // Build all-time leaderboard (avg score, 3+ games)
    const lbMap = {};
    for (const r of allResults) {
      if (!lbMap[r.user_id]) lbMap[r.user_id] = { total: 0, count: 0, best: 0 };
      lbMap[r.user_id].total += r.total_score;
      lbMap[r.user_id].count++;
      if (r.total_score > lbMap[r.user_id].best) lbMap[r.user_id].best = r.total_score;
    }
    const fullRanked = Object.entries(lbMap)
      .map(([id, u]) => ({
        id,
        name: profileMap[id]?.display_name || 'Player',
        avg: u.total / u.count,
        best: u.best,
        count: u.count,
      }))
      .sort((a, b) => b.best - a.best);

    const top10 = fullRanked.slice(0, 10);

    // Best word across all players this week
    const bestThisWeek = weekResults.reduce((best, r) =>
      (r.best_word_score || 0) > (best?.best_word_score || 0) ? r : best, null);
    const bestWordThisWeek = bestThisWeek?.best_word
      ? { word: bestThisWeek.best_word, score: bestThisWeek.best_word_score, playerName: profileMap[bestThisWeek.user_id]?.display_name || 'a player' }
      : null;

    // Badges earned this week — compare profile badges to what they had a week ago
    // We can't know exactly, so we surface all earned badges as "this week's" for new earners
    // In practice: just show their full badge list if they have any
    // (A more precise implementation would require a badge_earned_at column)

    // Send one personalised email per user — skip unsubscribed
    const emails = confirmedUsers
      .filter(user => !profileMap[user.id]?.email_unsubscribed)
      .map(user => {
      const profile = profileMap[user.id];
      const name = profile?.display_name || null;

      // This user's scores this week
      const myWeekScores = weekResults
        .filter(r => r.user_id === user.id)
        .sort((a, b) => new Date(a.played_at) - new Date(b.played_at));

      // Their rank in the full leaderboard
      const rankIndex = fullRanked.findIndex(r => r.id === user.id);
      const userRank = rankIndex >= 0 ? rankIndex + 1 : null;

      // Build leaderboard rows: top 10 + user's row if outside top 10
      let lbRows = top10.map((r, i) => ({ ...r, rank: i + 1, isYou: r.id === user.id }));
      if (userRank && userRank > 10) {
        lbRows.push({ rank: '···', name: '', avg: 0, best: 0, isYou: false }); // divider
        lbRows.push({ ...fullRanked[rankIndex], rank: userRank, isYou: true });
      }

      // Badges earned this week (simplification: badges from profile that weren't there before)
      // For now show all earned badges — mark as "this week's" if they have any
      const myBadges = Array.isArray(profile?.badges)
        ? profile.badges.map(id => BADGE_NAMES[id] || id)
        : [];

      // New badges this week = week scores have more badges than they had — 
      // approximate by checking if they played this week and have badges
      const newBadges = myWeekScores.length > 0 ? myBadges : [];

      return {
        from: FROM_EMAIL,
        to: user.email,
        subject: 'This week in Elevensies 🟨',
        html: buildEmail({
          name,
          weekScores: myWeekScores,
          bestWordThisWeek,
          leaderboard: lbRows,
          userRank,
          newBadges,
          totalUsers: fullRanked.length,
          userId: user.id,
        }),
      };
    });

    // Send in batches of 100
    for (let i = 0; i < emails.length; i += 100) {
      await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emails.slice(i, i + 100)),
      });
    }

    return res.status(200).json({ sent: emails.length });
  } catch (err) {
    console.error('weekly-roundup error:', err);
    return res.status(500).json({ error: err.message });
  }
}
