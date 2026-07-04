// api/preview-email.js — DELETE THIS FILE before going fully public.
// Visit in your browser:
//   /api/preview-email?type=weekly&uid=YOUR_UUID
//   /api/preview-email?type=welcome
//   /api/preview-email?type=reminder&streak=3&name=Alex

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GAME_URL = 'https://playelevensies.com';

const BADGE_NAMES = {
  streak:'STREAK', wordsmith:'WORDSMITH', avid:'AVID',
  doubledown:'DOUBLES', spotter:'SPOTTER', purist:'PURIST',
  linguist:'LINGUIST', centurion:'CENTURION'
};

async function db(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  return res.json();
}

const wrap = (inner) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
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

const header = `<tr><td align="center" style="padding:44px 40px 16px 40px;">
  <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;text-transform:uppercase;">ELEVENSIES</h1>
</td></tr>`;

const footer = (uid) => `<tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
  <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">
    You're receiving this as a registered Elevensies player.
    <a href="${GAME_URL}/api/unsubscribe?uid=${uid || 'preview'}" style="color:#8ba895;text-decoration:underline;">Unsubscribe</a>
  </p>
  <p style="font-family:'Jost',sans-serif;font-size:11px;line-height:16px;color:#6f8a78;margin:8px 0 0 0;"><a href="https://ksniuexnzikitbadttxx.supabase.co/storage/v1/object/public/Privacy%20Policy/elevensies_privacy_policy.pdf" style="color:#6f8a78;text-decoration:underline;">Privacy Policy</a></p>
</td></tr>`;

const cta = (label) => `<tr><td align="center" style="padding:0 40px 44px 40px;">
  <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">${label}</a>
</td></tr>`;

const divider = (label) => `<tr><td colspan="10" style="padding:20px 40px 8px;">
  <p style="font-family:'Jost',sans-serif;font-size:10px;letter-spacing:0.15em;color:#8ba895;margin:0;border-bottom:1px solid rgba(240,192,32,0.2);padding-bottom:8px;">${label}</p>
</td></tr>`;

export default async function handler(req, res) {
  const type = req.query.type || 'weekly';

  // ── Reminder preview ────────────────────────────────────────────────────
  if (type === 'reminder') {
    const streak = parseInt(req.query.streak || '3');
    const name = req.query.name || 'there';
    const score = parseInt(req.query.score || '94');
    const streakLine = streak >= 2
      ? `You're on a <strong style="color:#f0c020;">${streak}-day streak</strong> — don't break it now.`
      : `Today's your chance to start a streak.`;
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(wrap(`
      ${header}
      <tr><td style="padding:0 40px;text-align:center;">
        <h2 style="font-family:'Jost',sans-serif;font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Time for Elevensies!</h2>
        <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 12px 0;">Hey ${name}, today's game is open right now. You've got one hour.</p>
        <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 20px 0;">${streakLine}</p>
      </td></tr>
      <tr><td style="padding:0 24px 24px;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0">
          <tr><td style="background-color:#114b29;padding:16px 20px;text-align:center;border-radius:8px;">
            <p style="font-family:'Jost',sans-serif;font-size:12px;letter-spacing:0.12em;color:#8ba895;margin:0 0 6px 0;">YESTERDAY'S SCORE</p>
            <p style="font-family:'Jost',sans-serif;font-size:48px;font-weight:900;color:#f0c020;margin:0 0 4px 0;line-height:1;">${score}</p>
            <p style="font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;margin:0;opacity:0.8;">Can you beat it?</p>
          </td></tr>
        </table>
      </td></tr>
      ${cta('Play Now')}
      <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
        <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">
          You're getting this because you played yesterday.
          <a href="${GAME_URL}/api/unsubscribe-reminders?uid=preview" style="color:#8ba895;text-decoration:underline;">Stop reminders</a>
        </p>
        <p style="font-family:'Jost',sans-serif;font-size:11px;line-height:16px;color:#6f8a78;margin:8px 0 0 0;"><a href="https://ksniuexnzikitbadttxx.supabase.co/storage/v1/object/public/Privacy%20Policy/elevensies_privacy_policy.pdf" style="color:#6f8a78;text-decoration:underline;">Privacy Policy</a></p>
      </td></tr>
    `));
  }

  // ── Welcome preview ──────────────────────────────────────────────────────
  if (type === 'welcome') {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(wrap(`
      ${header}
      <tr><td style="padding:0 40px;text-align:center;">
        <h2 style="font-family:'Jost',sans-serif;font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Welcome, there.</h2>
        <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 28px 0;">
          Your account is set up and your stats are ready to track. The game opens every day at 11am — 10 tiles, 11 turns, one shot at the leaderboard. Your score counts even if you don't finish, so make every word count.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:0 40px 28px 40px;">
        <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">Play Elevensies</a>
      </td></tr>
      <tr><td align="center" style="padding:0 40px 44px 40px;">
        <a href="${GAME_URL}/api/subscribe?uid=preview" style="display:inline-block;border:2px solid rgba(240,192,32,0.5);color:#f0c020;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;text-decoration:none;padding:10px 24px;border-radius:8px;letter-spacing:0.08em;text-transform:uppercase;">🔔 Remind me at 11am</a>
      </td></tr>
      <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
        <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">You're receiving this because you just created an Elevensies account. Check your junk folder for future emails!</p>
        <p style="font-family:'Jost',sans-serif;font-size:11px;line-height:16px;color:#6f8a78;margin:8px 0 0 0;"><a href="https://ksniuexnzikitbadttxx.supabase.co/storage/v1/object/public/Privacy%20Policy/elevensies_privacy_policy.pdf" style="color:#6f8a78;text-decoration:underline;">Privacy Policy</a></p>
      </td></tr>
    `));
  }

  // ── Weekly preview ───────────────────────────────────────────────────────
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const allResults = await db('/game_results?select=user_id,total_score,best_word,best_word_score,played_at&game_status=eq.completed&order=played_at.desc');
    const weekResults = allResults.filter(r => r.played_at > oneWeekAgo);

    const profiles = await db('/profiles?select=id,display_name,badges');
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

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
    const top10 = fullRanked.slice(0, 10);

    const globalBestThisWeek = weekResults.reduce((b, r) => (r.best_word_score || 0) > (b?.best_word_score || 0) ? r : b, null);
    const globalBestWord = globalBestThisWeek?.best_word
      ? { word: globalBestThisWeek.best_word, score: globalBestThisWeek.best_word_score, playerName: profileMap[globalBestThisWeek.user_id]?.display_name || 'a player' }
      : null;

    const previewUserId = req.query.uid || fullRanked[0]?.id;
    const previewProfile = previewUserId ? profileMap[previewUserId] : null;
    const previewName = previewProfile?.display_name || 'Player';

    const myWeekScores = weekResults.filter(r => r.user_id === previewUserId).sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
    const myBestThisWeek = myWeekScores.reduce((b, r) => (r.best_word_score || 0) > (b?.best_word_score || 0) ? r : b, null);
    const myBestWord = myBestThisWeek?.best_word ? { word: myBestThisWeek.best_word, score: myBestThisWeek.best_word_score } : null;

    const rankIndex = fullRanked.findIndex(r => r.id === previewUserId);
    const userRank = rankIndex >= 0 ? rankIndex + 1 : null;
    const myBadges = Array.isArray(previewProfile?.badges) ? previewProfile.badges.map(id => BADGE_NAMES[id] || id) : [];

    let lbRows = top10.map((r, i) => ({ ...r, rank: i + 1, isYou: r.id === previewUserId }));
    if (userRank && userRank > 10) {
      lbRows.push({ rank: '···', name: '', avg: 0, best: 0, isYou: false });
      lbRows.push({ ...fullRanked[rankIndex], rank: userRank, isYou: true });
    }

    const scoresHTML = myWeekScores.length > 0
      ? myWeekScores.map(s => `<tr>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;">${new Date(s.played_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;text-align:right;">${s.total_score}</td>
          <td style="padding:6px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;text-align:right;">${s.best_word || '—'}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#8ba895;font-size:13px;font-family:'Jost',sans-serif;">No games this week</td></tr>`;

    const lbHTML = lbRows.map(row => {
      if (row.rank === '···') return `<tr><td colspan="4" style="padding:4px 12px;text-align:center;color:#8ba895;font-size:12px;font-family:'Jost',sans-serif;">···</td></tr>`;
      return `<tr style="${row.isYou ? 'background-color:rgba(240,192,32,0.1);' : ''}">
        <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;">${row.rank}</td>
        <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:${row.isYou ? '#f0c020' : '#e2e8f0'};font-weight:${row.isYou ? '700' : '400'};">${row.name}${row.isYou ? ' ★' : ''}</td>
        <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;text-align:right;">${Math.round(row.avg)}</td>
        <td style="padding:7px 12px;font-family:'Jost',sans-serif;font-size:13px;color:#f0c020;font-weight:700;text-align:right;">${row.best}</td>
      </tr>`;
    }).join('');

    const rankLine = userRank
      ? `You're ranked <strong style="color:#f0c020;">#${userRank} of ${fullRanked.length}</strong> overall.`
      : `Play more games to earn a leaderboard ranking.`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(wrap(`
      ${header}
      <tr><td style="padding:0 40px 20px;text-align:center;">
        <h2 style="font-family:'Jost',sans-serif;font-size:18px;font-weight:700;color:#ffffff;margin:0 0 6px 0;">This week's roundup</h2>
        <p style="font-family:'Jost',sans-serif;font-size:13px;color:#e2e8f0;margin:0;opacity:0.8;">Hey ${previewName}, here's how your week looked.</p>
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

      ${myBadges.length > 0 ? `
      ${divider('BADGES EARNED')}
      <tr><td style="padding:8px 40px 16px;text-align:center;">
        ${myBadges.map(b => `<span style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:11px;font-weight:700;padding:4px 10px;margin:3px;letter-spacing:0.08em;">${b}</span>`).join('')}
      </td></tr>` : ''}

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

      ${divider('ABOUT ELEVENSIES')}
      <tr><td style="padding:8px 40px 24px;text-align:center;">
        <p style="font-family:'Jost',sans-serif;font-size:14px;line-height:1.6;color:#e2e8f0;margin:0 0 12px 0;">
          Elevensies is a free daily word game — no ads, no subscriptions, no nonsense. Just you, 10 tiles, and one hour a day to find your best words.
        </p>
        <p style="font-family:'Jost',sans-serif;font-size:14px;line-height:1.6;color:#e2e8f0;margin:0 0 16px 0;">
        </p>
        <p style="font-family:'Jost',sans-serif;font-size:13px;color:#8ba895;margin:0;">
          ${weekResults.length} games played across all players this week.
        </p>
      </td></tr>

      ${cta('Play This Week')}
      ${footer(previewUserId)}
    `));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
