// api/save-game.js
// Server-side score validation and saving.
// Client sends the word history — server recalculates score independently,
// validates every word, then inserts to Supabase using the service key.
// The client never writes to game_results directly for full game scores.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Letter values — must match client exactly
const LETTER_VALUES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,
  N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10
};

function scoreWord(word) {
  return word.toUpperCase().split('').reduce((sum, l) => sum + (LETTER_VALUES[l] || 0), 0);
}

// Load the dictionary once per cold start
let DICTIONARY = null;
async function getDictionary() {
  if (DICTIONARY) return DICTIONARY;
  // Use the same word list embedded in the game — fetch from the deployed URL
  // For validation we use a basic known-words check via a curated list
  // The full dictionary is too large to bundle here, so we validate structure only
  // and rely on the client having already validated words against the real dictionary.
  // What we DO validate server-side: score integrity and basic word format.
  DICTIONARY = true; // placeholder — see note below
  return DICTIONARY;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the user's JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const jwt = authHeader.replace('Bearer ', '');

  // Validate JWT with Supabase
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

  const { history, utc_offset } = req.body;

  // Validate history structure
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: 'Invalid history' });
  }
  if (history.length > 11) {
    return res.status(400).json({ error: 'Too many words' });
  }

  // Validate each word and recalculate score server-side
  const VALID_WORD = /^[A-Za-z]+$/;
  let recalculatedScore = 0;
  const sanitisedHistory = [];

  for (const entry of history) {
    const word = (entry.word || '').toUpperCase().trim();
    // Basic format validation
    if (!word || !VALID_WORD.test(word) || word.length < 2 || word.length > 11) {
      return res.status(400).json({ error: `Invalid word: ${word}` });
    }
    // Recalculate score from letter values — ignores whatever score the client sent
    const serverScore = scoreWord(word);
    recalculatedScore += serverScore;
    sanitisedHistory.push({ word, score: serverScore });
  }

  const wordsPlayed = sanitisedHistory.length;
  const avg = wordsPlayed ? recalculatedScore / wordsPlayed : 0;
  const best = sanitisedHistory.reduce((b, h) => (h.score > (b?.score ?? -1) ? h : b), null);

  // Check not already played or used a freeze today (server-side duplicate guard)
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=in.(completed,freeze)&played_at=gte.${today}T00:00:00&select=id,game_status`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  ).then(r => r.json()).then(data => ({ data })).catch(() => ({ data: null }));

  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'Already played today' });
  }

  // Get previous stats for personal best check
  const prevRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=eq.completed&select=total_score&order=total_score.desc&limit=1`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const prevData = await prevRes.json();
  const prevBest = prevData?.[0]?.total_score ?? 0;
  const isPersonalBest = recalculatedScore > prevBest;

  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=eq.completed&select=id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact', Range: '0-0' } }
  );
  const countHeader = countRes.headers.get('content-range');
  const prevCount = countHeader ? parseInt(countHeader.split('/')[1]) || 0 : 0;

  // Insert using service key — client can't do this
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/game_results`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: user.id,
      total_score: recalculatedScore,
      words_played: wordsPlayed,
      avg_points_per_word: Math.round(avg * 100) / 100,
      best_word: best?.word ?? null,
      best_word_score: best?.score ?? null,
      history: sanitisedHistory,
      game_status: 'completed',
      utc_offset: typeof utc_offset === 'number' ? utc_offset : null,
    }),
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error('Insert failed:', err);
    return res.status(500).json({ error: 'Could not save score' });
  }

  // Update profile utc_offset so reminder emails fire at the right local time
  if (typeof utc_offset === 'number') {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ utc_offset }),
    });
  }

  return res.status(200).json({
    score: recalculatedScore,
    isPersonalBest,
    prevPlayed: prevCount,
    newPlayed: prevCount + 1,
  });
}
