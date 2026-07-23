// api/weekly-roundup.js
// Personalised weekly roundup — called by Supabase pg_cron every Sunday at 6pm UTC.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';
const GAME_URL = 'https://playelevensies.com';
const CRON_SECRET = process.env.CRON_SECRET;

const BADGE_FILENAMES = {
  streak: 'No-Streak', wordsmith: 'Wordsmith', avid: 'Avid',
  doubledown: 'Doubles', spotter: 'Spotter', purist: 'Purist',
  linguist: 'Lingust', centurion: 'Centurion', expert: 'Expert',
  favourite: 'Favourite', elevensies: 'Elevensies',
};

const BADGE_LABELS = {
  streak: 'STREAK', wordsmith: 'WORDSMITH', avid: 'AVID',
  doubledown: 'DOUBLES', spotter: 'SPOTTER', purist: 'PURIST',
  linguist: 'LINGUIST', centurion: 'CENTURION', expert: 'EXPERT',
  favourite: 'FAVOURITE', elevensies: 'ELEVENSIES',
};

const badgeCell = (id, streakCount) => {
  const label = BADGE_LABELS[id] || id.toUpperCase();
  const inner = (id === 'streak' && streakCount)
    ? `<table cellpadding="0" cellspacing="0" style="width:44px;height:44px;background:#f0c020;"><tr><td align="center" valign="middle" style="font-family:'Jost',sans-serif;font-size:18px;font-weight:900;color:#155c33;line-height:1;">${streakCount}</td></tr></table>`
    : `<img src="${GAME_URL}/icons/badges/${BADGE_FILENAMES[id] || 'No-Streak'}.png" width="44" height="44" style="display:block;margin:0 auto;" alt="${label}">`;
  return `<td style="padding:0 6px;text-align:center;">${inner}<p style="font-family:'Jost',sans-serif;font-size:9px;color:#8ba895;margin:4px 0 0;letter-spacing:0.08em;">${label}</p></td>`;
};

async function db(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Accept': 'application/json' },
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

const divider = (label) => `
  <tr><td colspan="10" style="padding:20px 40px 8px;">
    <p style="font-family:'Jost',sans-serif;font-size:10px;letter-spacing:0.15em;color:#8ba895;margin:0;border-bottom:1px solid rgba(240,192,32,0.2);padding-bottom:8px;">${label}</p>
  </td></tr>`;

function buildEmail({ name, userId, weekScores, myBestWord, globalBestWord, leaderboard, userRank, badges, totalUsers, totalGamesPlayed }) {

  const greeting = name && !name.startsWith('user') ? `Hey ${name},` : 'Hey,';
  const rankLine = userRank
    ? `You're ranked <strong style="color:#f0c020;">#${userRank} of ${totalUsers}</strong> overall.`
    : `Play more games to earn a leaderboard ranking.`;

  const scoresHTML = weekScores.length > 0
    ? weekScores.map(s => `
        <tr>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;">${new Date(s.played_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;text-align:right;">${s.total_score}</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;text-align:right;">${s.best_word || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#8ba895;font-size:13px;font-family:'Jost',sans-serif;">No games this week — come back next Sunday!</td></tr>`;

  const lbHTML = leaderboard.map(row => {
    if (row.rank === '···') return `<tr><td colspan="4" style="padding:4px 12px;text-align:center;color:#8ba895;font-size:12px;font-family:'Jost',sans-serif;">···</td></tr>`;
    return `<tr style="${row.isYou ? 'background-color:rgba(240,192,32,0.1);' : ''}">
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;">#${row.rank}</td>
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:${row.isYou ? '#f0c020' : '#e2e8f0'};font-weight:${row.isYou ? '700' : '400'};">${row.name}${row.isYou ? ' ★' : ''}</td>
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;text-align:right;">${Math.round(row.avg)}</td>
      <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;text-align:right;">${row.best}</td>
    </tr>`;
  }).join('');

  const badgesHTML = badges.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>${badges.map(b => badgeCell(b.id, b.streak)).join('')}</tr></table>`
    : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>This Week in Elevensies</title>
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">

        <!-- Header -->
        <tr><td align="center" style="padding:44px 40px 16px 40px;">
          <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;">ELEVENSIES</h1>
        </td></tr>
        <tr><td style="padding:0 40px 20px;text-align:center;">
          <h2 style="font-family:'Jost',sans-serif;font-size:18px;font-weight:700;color:#ffffff;margin:0 0 6px 0;">This week's roundup</h2>
          <p style="font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;margin:0;opacity:0.8;">${greeting} here's how your week looked.</p>
        </td></tr>

        ${myBestWord ? `
        ${divider('YOUR WORD OF THE WEEK')}
        <tr><td style="padding:8px 40px 20px;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:36px;font-weight:900;color:#f0c020;margin:0 0 4px 0;letter-spacing:0.05em;">${myBestWord.word.toUpperCase()}</p>
          <p style="font-family:'Jost',sans-serif;font-size:12px;color:#e2e8f0;margin:0;opacity:0.7;">${myBestWord.score} pts</p>
        </td></tr>` : ''}

        ${globalBestWord && (!myBestWord || globalBestWord.word !== myBestWord.word) ? `
        ${divider('BEST WORD THIS WEEK')}
        <tr><td style="padding:8px 40px 20px;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:36px;font-weight:900;color:#f0c020;margin:0 0 4px 0;letter-spacing:0.05em;">${globalBestWord.word.toUpperCase()}</p>
          <p style="font-family:'Jost',sans-serif;font-size:12px;color:#e2e8f0;margin:0;opacity:0.7;">${globalBestWord.score} pts · played by ${globalBestWord.playerName}</p>
        </td></tr>` : ''}

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
        ${divider('YOUR BADGES')}
        <tr><td style="padding:8px 40px 16px;text-align:center;">${badgesHTML}</td></tr>` : ''}

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
        <tr><td style="padding:8px 40px 16px;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;color:#e2e8f0;margin:0;opacity:0.7;">${rankLine}</p>
        </td></tr>

        <tr><td style="padding:8px 40px 24px;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:13px;color:#8ba895;margin:0;">${totalGamesPlayed} games played across all players this week.</p>
        </td></tr>

        <tr><td align="center" style="padding:0 40px 44px 40px;">
          <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">Play This Week</a>
        </td></tr>

        <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">
            You're receiving this as a registered Elevensies player.
            <a href="${GAME_URL}/api/unsubscribe?uid=${userId}" style="color:#8ba895;text-decoration:underline;">Unsubscribe</a>
          </p>
          <p style="font-family:'Jost',sans-serif;font-size:11px;line-height:16px;color:#6f8a78;margin:8px 0 0 0;">
            <a href="https://ksniuexnzikitbadttxx.supabase.co/storage/v1/object/public/Privacy%20Policy/elevensies_privacy_policy.pdf" style="color:#6f8a78;text-decoration:underline;">Privacy Policy</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'] || req.body?.secret;
  if (CRON_SECRET && secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const previewEmail = req.body?.preview_email || null;

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const allResults = await db('/game_results?select=user_id,total_score,best_word,best_word_score,played_at,avg_points_per_word&game_status=eq.completed&order=played_at.desc');
    const weekResults = allResults.filter(r => r.played_at > oneWeekAgo);

    const profiles = await db('/profiles?select=id,display_name,badges,email_unsubscribed');
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    // Calculate streak and avg word score per user from game results
    const streakMap = {};
    const avgWordMap = {};
    const datesByUser = {};
    for (const r of allResults) {
      if (!datesByUser[r.user_id]) datesByUser[r.user_id] = new Set();
      datesByUser[r.user_id].add(r.played_at.slice(0, 10));
    }
    for (const [uid, datesSet] of Object.entries(datesByUser)) {
      const dates = [...datesSet].sort().reverse();
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yest = new Date(now - 86400000).toISOString().slice(0, 10);
      if (dates[0] !== today && dates[0] !== yest) { streakMap[uid] = 0; continue; }
      let streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const diff = Math.round((new Date(dates[i-1]) - new Date(dates[i])) / 86400000);
        if (diff === 1) streak++;
        else break;
      }
      streakMap[uid] = streak;
    }

    // Avg word score per user
    const wordTotals = {};
    const wordCounts = {};
    for (const r of allResults) {
      if (r.avg_points_per_word) {
        if (!wordTotals[r.user_id]) { wordTotals[r.user_id] = 0; wordCounts[r.user_id] = 0; }
        wordTotals[r.user_id] += r.avg_points_per_word;
        wordCounts[r.user_id]++;
      }
    }
    for (const uid of Object.keys(wordTotals)) {
      avgWordMap[uid] = wordTotals[uid] / wordCounts[uid];
    }

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const { users } = await authRes.json();
    const confirmedUsers = (users || []).filter(u => u.email && u.email_confirmed_at);
    if (confirmedUsers.length === 0) return res.status(200).json({ message: 'No recipients' });

    // All-time leaderboard
    const lbMap = {};
    for (const r of allResults) {
      if (!lbMap[r.user_id]) lbMap[r.user_id] = { total: 0, count: 0, best: 0 };
      lbMap[r.user_id].total += r.total_score;
      lbMap[r.user_id].count++;
      if (r.total_score > lbMap[r.user_id].best) lbMap[r.user_id].best = r.total_score;
    }
    const fullRanked = Object.entries(lbMap)
      .map(([id, u]) => ({ id, name: profileMap[id]?.display_name || 'Player', avg: u.total / u.count, best: u.best }))
      .sort((a, b) => b.best - a.best);
    const top11 = fullRanked.slice(0, 11);

    // Global best word this week
    const globalBestThisWeek = weekResults.reduce((b, r) => (r.best_word_score || 0) > (b?.best_word_score || 0) ? r : b, null);
    const globalBestWord = globalBestThisWeek?.best_word
      ? { word: globalBestThisWeek.best_word, score: globalBestThisWeek.best_word_score, playerName: profileMap[globalBestThisWeek.user_id]?.display_name || 'a player' }
      : null;

    const totalGamesPlayed = weekResults.length;

    const emails = confirmedUsers
      .filter(user => !profileMap[user.id]?.email_unsubscribed)
      .filter(user => previewEmail ? user.email === previewEmail : true)
      .map(user => {
        const profile = profileMap[user.id];
        const name = profile?.display_name || null;

        const myWeekScores = weekResults
          .filter(r => r.user_id === user.id)
          .sort((a, b) => new Date(a.played_at) - new Date(b.played_at));

        const myBestThisWeek = myWeekScores.reduce((b, r) => (r.best_word_score || 0) > (b?.best_word_score || 0) ? r : b, null);
        const myBestWord = myBestThisWeek?.best_word
          ? { word: myBestThisWeek.best_word, score: myBestThisWeek.best_word_score }
          : null;

        const rankIndex = fullRanked.findIndex(r => r.id === user.id);
        const userRank = rankIndex >= 0 ? rankIndex + 1 : null;

        let lbRows = top11.map((r, i) => ({ ...r, rank: i + 1, isYou: r.id === user.id }));
        if (userRank && userRank > 11) {
          lbRows.push({ rank: '···', name: '', avg: 0, best: 0, isYou: false });
          lbRows.push({ ...fullRanked[rankIndex], rank: userRank, isYou: true });
        }

        // Badges — always show all, regardless of whether they played this week
        const storedBadges = Array.isArray(profile?.badges)
          ? profile.badges.map(id => ({ id, streak: null }))
          : [];
        const userStreak = streakMap[user.id] || 0;
        if (userStreak > 0) storedBadges.push({ id: 'streak', streak: userStreak });
        const avgWord = avgWordMap[user.id] || 0;
        const hasWrd = storedBadges.some(b => b.id === 'wordsmith');
        if (avgWord > 11 && !hasWrd) storedBadges.push({ id: 'wordsmith', streak: null });
        const badges = storedBadges;

        return {
          from: FROM_EMAIL,
          to: user.email,
          subject: 'This week in Elevensies 🟨',
          html: buildEmail({
            name, userId: user.id,
            weekScores: myWeekScores,
            myBestWord,
            globalBestWord,
            leaderboard: lbRows,
            userRank,
            badges,
            totalUsers: fullRanked.length,
            totalGamesPlayed,
          }),
        };
      });

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
