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
  linguist: 'Linguist', centurion: 'Centurion', expert: 'Expert',
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

// ===== Scaling helpers =====
// PostgREST returns at most 1000 rows per request. This job reads whole tables,
// so without paging it silently stops at row 1000 and every figure it produces
// — leaderboard, ranks, streaks — is computed from a truncated slice.

const PAGE_SIZE = 1000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function dbAll(path, orderCol = 'id') {
  const sep = path.includes('?') ? '&' : '?';
  let out = [];
  let offset = 0;
  while (true) {
    const page = await db(`${path}${sep}order=${orderCol}.asc&limit=${PAGE_SIZE}&offset=${offset}`);
    if (!page.length) break;
    out = out.concat(page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

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
    if (page > 100) break;
  }
  return all;
}

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

const divider = (label) => `
  <tr><td colspan="10" style="padding:20px 40px 8px;">
    <p style="font-family:'Jost',sans-serif;font-size:10px;letter-spacing:0.15em;color:#8ba895;margin:0;border-bottom:1px solid rgba(240,192,32,0.2);padding-bottom:8px;">${label}</p>
  </td></tr>`;

function buildEmail({ name, userId, weekScores, myBestWord, globalBestWord, leaderboard, userRank, badges, totalUsers, totalGamesPlayed }) {

  const greeting = name && !name.startsWith('user') ? `Hey ${name},` : 'Hey,';
  const rankLine = userRank
    ? `You're ranked <strong style="color:#f0c020;">#${userRank} of ${totalUsers}</strong> overall.`
    : `Play more games to earn a Top 11 ranking.`;

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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;700;900&display=swap');
    @font-face {
      font-family: 'Jost';
      font-weight: 400;
      src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Jost';
      font-weight: 700;
      src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Jost';
      font-weight: 900;
      src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2');
    }
  </style>
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

        ${divider('TOP 11')}
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
    // Everything the email needs is aggregated in Postgres — one row per
    // player instead of every game ever played. See elevensies_roundup().
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/elevensies_roundup`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!rpc.ok) {
      const detail = await rpc.text();
      console.error('elevensies_roundup failed:', rpc.status, detail);
      return res.status(500).json({ error: 'Aggregation failed', detail });
    }
    const players = await rpc.json();
    if (!Array.isArray(players)) {
      console.error('elevensies_roundup returned unexpected shape:', players);
      return res.status(500).json({ error: 'Aggregation returned no rows' });
    }

    const playerMap = {};
    players.forEach(p => { playerMap[p.user_id] = p; });

    const users = await listAllAuthUsers();
    const confirmedUsers = users.filter(u => u.email && u.email_confirmed_at);
    if (confirmedUsers.length === 0) return res.status(200).json({ message: 'No recipients' });

    // Top 11 all-time, ranked by best score
    const top11 = players
      .filter(p => p.rank && p.rank <= 11)
      .sort((a, b) => a.rank - b.rank)
      .map(p => ({
        id: p.user_id,
        name: p.display_name || 'Player',
        avg: Number(p.avg_score),
        best: p.best_score,
      }));

    const totalUsers = players.filter(p => p.games_played > 0).length;
    const totalGamesPlayed = players.reduce((s, p) => s + (p.week_count || 0), 0);

    // Best word played by anyone this week
    const globalBestRow = players.reduce(
      (b, p) => ((p.week_best_score || 0) > (b?.week_best_score || 0) ? p : b), null);
    const globalBestWord = globalBestRow?.week_best_word
      ? {
          word: globalBestRow.week_best_word,
          score: globalBestRow.week_best_score,
          playerName: globalBestRow.display_name || 'a player',
        }
      : null;

    const emails = confirmedUsers
      .filter(user => !playerMap[user.id]?.email_unsubscribed)
      .filter(user => previewEmail ? user.email === previewEmail : true)
      .map(user => {
        const p = playerMap[user.id] || {};
        const name = p.display_name || null;

        const myWeekScores = Array.isArray(p.week_games) ? p.week_games : [];
        const myBestWord = p.week_best_word
          ? { word: p.week_best_word, score: p.week_best_score }
          : null;

        const userRank = p.rank || null;

        let lbRows = top11.map((r, i) => ({ ...r, rank: i + 1, isYou: r.id === user.id }));
        if (userRank && userRank > 11) {
          lbRows.push({ rank: '···', name: '', avg: 0, best: 0, isYou: false });
          lbRows.push({
            id: user.id,
            name: name || 'Player',
            avg: Number(p.avg_score),
            best: p.best_score,
            rank: userRank,
            isYou: true,
          });
        }

        // Badges — always show all, regardless of whether they played this week
        const badges = (p.badges || []).map(id => ({ id, streak: null }));
        if ((p.streak || 0) > 0) badges.push({ id: 'streak', streak: p.streak });
        if (Number(p.avg_word) >= 11 && !badges.some(b => b.id === 'wordsmith')) {
          badges.push({ id: 'wordsmith', streak: null });
        }

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
            totalUsers,
            totalGamesPlayed,
          }),
        };
      });

    const { sent, failed } = await sendResendBatches(emails);

    return res.status(200).json({ sent, failed, recipients: emails.length });
  } catch (err) {
    console.error('weekly-roundup error:', err);
    return res.status(500).json({ error: err.message });
  }
}
