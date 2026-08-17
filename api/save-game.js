// api/save-game.js
//
// Two routes, because the Vercel Hobby plan caps us at 12 functions:
//
//   POST /api/save-game?start=1   issue (or return) today's seed for this player
//   POST /api/save-game           save a finished game, validating it first
//
// How validation works: the seed is generated here and never derived from
// anything the browser controls. The browser builds its rack from that seed
// using exactly the functions below, so this file can rebuild the same rack,
// replay every turn, and confirm each word was a real word made from letters
// the player actually held at that moment.
//
// VALIDATION_MODE:
//   'log'     — check everything, log failures, still save. Use this first.
//   'enforce' — reject games that fail validation.
// Switch to 'enforce' once the logs have been clean for a few days.

const VALIDATION_MODE = 'log';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DICTIONARY_URL = 'https://playelevensies.com/dictionary.txt';

// ---------------------------------------------------------------------------
// Shared game maths — MUST stay byte-for-byte identical to the copies in
// elevensies.html. If you change one, change both, or every game will fail
// validation.
// ---------------------------------------------------------------------------

const LETTER_VALUES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,
  N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10
};

const LETTER_POOL = "AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ".split("");

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const MIN_VOWELS = 2;
const MAX_VOWELS = 4;
const THREE_POINT = new Set(['B','C','M','P']);
const FOUR_POINT  = new Set(['F','H','V','W','Y']);
const MAX_TURNS = 11;

// mulberry32, seeded from a string. Integer maths only, so browser and server
// produce identical sequences.
function makeRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreWord(word) {
  return word.toUpperCase().split('').reduce((sum, l) => sum + (LETTER_VALUES[l] || 0), 0);
}

function drawLetters(n, rng) {
  const pool = [...LETTER_POOL];
  const drawn = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    drawn.push(pool.splice(idx, 1)[0]);
  }
  return drawn;
}

function countVowels(letters) {
  return letters.filter(l => VOWELS.has(l)).length;
}

function hasGoodValueSpread(letters) {
  const threes = letters.filter(l => THREE_POINT.has(l)).length;
  const fours  = letters.filter(l => FOUR_POINT.has(l)).length;
  return threes >= 1 && threes <= 2 && fours >= 1 && fours <= 2;
}

function drawBalancedRack(n, rng) {
  let attempt = drawLetters(n, rng);
  let tries = 0;
  const hasRepeatFlood = (arr) => {
    const counts = {};
    for (const l of arr) {
      counts[l] = (counts[l] || 0) + 1;
      if (counts[l] > 2) return true;
    }
    return false;
  };
  while ((countVowels(attempt) < MIN_VOWELS || countVowels(attempt) > MAX_VOWELS || hasRepeatFlood(attempt) || !hasGoodValueSpread(attempt)) && tries < 200) {
    attempt = drawLetters(n, rng);
    tries++;
  }
  return attempt;
}

function drawBalancedBatch(count, unchangedLetters, rng) {
  if (count === 0) return [];
  const baseVowels = countVowels(unchangedLetters);
  const maxRepeatsTotal = 2;
  const baseCounts = {};
  for (const l of unchangedLetters) baseCounts[l] = (baseCounts[l] || 0) + 1;

  let attempt = [];
  let tries = 0;
  while (tries < 500) {
    attempt = drawLetters(count, rng);
    const vowels = baseVowels + countVowels(attempt);
    const counts = { ...baseCounts };
    let repeatsOk = true;
    for (const l of attempt) {
      counts[l] = (counts[l] || 0) + 1;
      if (counts[l] > maxRepeatsTotal) { repeatsOk = false; break; }
    }
    if (vowels >= MIN_VOWELS && vowels <= MAX_VOWELS && repeatsOk && hasGoodValueSpread([...Object.keys(counts).flatMap(l => Array(counts[l]).fill(l))])) return attempt;
    tries++;
  }

  const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split('');
  const VOWEL_LIST = "AEIOU".split('');
  let vowels = baseVowels + countVowels(attempt);
  let idx = 0;
  while (vowels > MAX_VOWELS && idx < attempt.length) {
    if (VOWELS.has(attempt[idx])) {
      attempt[idx] = CONSONANTS[Math.floor(rng() * CONSONANTS.length)];
      vowels--;
    }
    idx++;
  }
  idx = 0;
  while (vowels < MIN_VOWELS && idx < attempt.length) {
    if (!VOWELS.has(attempt[idx])) {
      attempt[idx] = VOWEL_LIST[Math.floor(rng() * VOWEL_LIST.length)];
      vowels++;
    }
    idx++;
  }
  return attempt;
}

// ---------------------------------------------------------------------------
// Dictionary — fetched once per cold start and kept in memory
// ---------------------------------------------------------------------------

let DICTIONARY = null;

async function getDictionary() {
  if (DICTIONARY) return DICTIONARY;
  try {
    const res = await fetch(DICTIONARY_URL);
    if (!res.ok) {
      console.error('Dictionary fetch failed:', res.status);
      return null;
    }
    const text = await res.text();
    DICTIONARY = new Set(
      text.split('\n').map(w => w.trim().toUpperCase()).filter(Boolean)
    );
    console.log('Dictionary loaded:', DICTIONARY.size, 'words');
    return DICTIONARY;
  } catch (err) {
    console.error('Dictionary load error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

// Replays the game from the seed and reports anything that couldn't have
// happened. Returns a list of problems — empty means the game checks out.
function validateGame(seed, words, joker, dictionary) {
  const problems = [];

  let rack = drawBalancedRack(10, makeRng(seed + ':init'));

  for (let i = 0; i < words.length; i++) {
    const turnNo = i + 1;
    const word = words[i];

    if (dictionary && !dictionary.has(word)) {
      problems.push(`turn ${turnNo}: "${word}" is not in the dictionary`);
    }

    // What the player had available this turn: their rack, plus the bonus
    // tile if this is the turn they spent it on.
    const available = {};
    for (const l of rack) available[l] = (available[l] || 0) + 1;
    const jokerThisTurn = joker && joker.letter && joker.turn === turnNo;
    if (jokerThisTurn) {
      available[joker.letter] = (available[joker.letter] || 0) + 1;
    }

    let short = false;
    const usedFromRack = {};
    let jokerUsed = false;
    for (const l of word) {
      if (!available[l]) { short = true; break; }
      available[l]--;
      // The bonus tile covers one instance of its own letter
      if (jokerThisTurn && l === joker.letter && !jokerUsed) {
        jokerUsed = true;
      } else {
        usedFromRack[l] = (usedFromRack[l] || 0) + 1;
      }
    }

    if (short) {
      problems.push(`turn ${turnNo}: "${word}" uses letters not on the rack (${rack.join('')}${jokerThisTurn ? '+' + joker.letter : ''})`);
      return problems; // rack state is now unknowable — stop here
    }

    if (turnNo >= MAX_TURNS) break; // no replacements on the final turn

    // Remove the used tiles, then deal the same replacements the browser did
    const remaining = [];
    const toRemove = { ...usedFromRack };
    for (const l of rack) {
      if (toRemove[l]) { toRemove[l]--; continue; }
      remaining.push(l);
    }
    const replacements = drawBalancedBatch(
      rack.length - remaining.length,
      remaining,
      makeRng(seed + ':t' + turnNo)
    );
    rack = remaining.concat(replacements);
  }

  return problems;
}

// Replays a seed forward through the words already played, and returns the
// rack exactly as the player would see it next. Used when a game is resumed
// — on the same device after a refresh, or on a different one — so it
// continues from the real position rather than starting turn 1 over.
function reconstructRack(seed, words, joker) {
  let rack = drawBalancedRack(10, makeRng(seed + ':init'));
  let jokerLetter = joker && joker.letter ? joker.letter : null;
  let jokerConsumed = false;

  for (let i = 0; i < words.length; i++) {
    const turnNo = i + 1;
    const word = words[i];
    const jokerThisTurn = jokerLetter && joker.turn === turnNo;

    const available = {};
    for (const l of rack) available[l] = (available[l] || 0) + 1;
    if (jokerThisTurn) available[jokerLetter] = (available[jokerLetter] || 0) + 1;

    const usedFromRack = {};
    let usedJoker = false;
    for (const l of word) {
      if (available[l] > 0) {
        available[l]--;
        if (jokerThisTurn && l === jokerLetter && !usedJoker) usedJoker = true;
        else usedFromRack[l] = (usedFromRack[l] || 0) + 1;
      }
    }
    if (usedJoker) jokerConsumed = true;

    if (turnNo >= MAX_TURNS) continue; // final turn has no replacement

    const remaining = [];
    const toRemove = { ...usedFromRack };
    for (const l of rack) {
      if (toRemove[l]) { toRemove[l]--; continue; }
      remaining.push(l);
    }
    const replacements = drawBalancedBatch(
      rack.length - remaining.length,
      remaining,
      makeRng(seed + ':t' + turnNo)
    );
    rack = remaining.concat(replacements);
  }

  return {
    rack,
    // The bonus letter is only still offerable if it was chosen but not spent
    joker: jokerLetter && !jokerConsumed ? { letter: jokerLetter, turn: joker.turn } : null,
    jokerSpent: jokerConsumed,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function localDateFor(utcOffsetMinutes) {
  const mins = typeof utcOffsetMinutes === 'number' ? utcOffsetMinutes : 0;
  const d = new Date(Date.now() + mins * 60000);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const jwt = authHeader.replace('Bearer ', '');

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

  const { utc_offset } = req.body || {};

  // ===== Route: issue today's seed =====
  if (req.query?.start) {
    const gameDate = localDateFor(utc_offset);

    // Return the existing seed if they've already started today — a refresh
    // or a second device must get the same letters, not a fresh rack. It also
    // carries whatever progress has been saved, so a resume can pick up from
    // the real current turn instead of starting turn 1 over with knowledge of
    // a rack the player has already seen.
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/game_seeds?user_id=eq.${user.id}&game_date=eq.${gameDate}&select=seed,history,joker`,
      { headers: sbHeaders() }
    );
    const existing = await existingRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      const row = existing[0];
      const words = Array.isArray(row.history) ? row.history.map(h => h.word) : [];
      const state = reconstructRack(row.seed, words, row.joker || null);
      // The bonus tile is only carried forward once actually spent — a letter
      // chosen but not yet played resets on resume, which costs nothing
      // since it's a free choice from the whole alphabet either way.
      return res.status(200).json({
        seed: row.seed,
        resumed: true,
        history: row.history || [],
        turns: words.length,
        rack: state.rack,
        jokerSpent: state.jokerSpent,
        jokerLetterUsed: state.jokerSpent ? row.joker?.letter ?? null : null,
        jokerUsedTurn: state.jokerSpent ? row.joker?.turn ?? null : null,
      });
    }

    const seed = `${user.id}:${gameDate}:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/game_seeds`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ user_id: user.id, game_date: gameDate, seed, history: [] }),
    });
    if (!insertRes.ok) {
      console.error('Seed insert failed:', await insertRes.text());
      return res.status(500).json({ error: 'Could not start game' });
    }
    const inserted = await insertRes.json();
    const finalSeed = Array.isArray(inserted) && inserted[0]?.seed ? inserted[0].seed : seed;
    return res.status(200).json({ seed: finalSeed, resumed: false, history: [], turns: 0 });
  }

  // ---- Progress: called after each turn so a resume knows where it stood ----
  if (req.query?.progress) {
    const gameDate = localDateFor(utc_offset);
    const { history: progressHistory, joker: progressJoker } = req.body || {};
    if (!Array.isArray(progressHistory)) {
      return res.status(400).json({ error: 'history array required' });
    }
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/game_seeds?user_id=eq.${user.id}&game_date=eq.${gameDate}`,
      {
        method: 'PATCH',
        headers: sbHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          history: progressHistory,
          joker: progressJoker || null,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!updateRes.ok) {
      console.error('Progress save failed:', await updateRes.text());
      return res.status(500).json({ error: 'Could not save progress' });
    }
    return res.status(200).json({ ok: true });
  }

  // ===== Route: save a finished game =====
  const { history, joker } = req.body || {};

  if (!Array.isArray(history)) return res.status(400).json({ error: 'Invalid history' });
  if (history.length > MAX_TURNS) return res.status(400).json({ error: 'Too many words' });

  const VALID_WORD = /^[A-Za-z]+$/;
  let recalculatedScore = 0;
  const sanitisedHistory = [];
  const plainWords = [];

  for (const entry of history) {
    const word = (entry.word || '').toUpperCase().trim();
    if (!word || !VALID_WORD.test(word) || word.length < 2 || word.length > 11) {
      return res.status(400).json({ error: `Invalid word: ${word}` });
    }
    const serverScore = scoreWord(word);
    recalculatedScore += serverScore;
    sanitisedHistory.push({ word, score: serverScore });
    plainWords.push(word);
  }

  // ----- Validation -----
  const gameDate = localDateFor(utc_offset);
  let validation = { checked: false, problems: [] };

  try {
    const seedRes = await fetch(
      `${SUPABASE_URL}/rest/v1/game_seeds?user_id=eq.${user.id}&game_date=eq.${gameDate}&select=seed`,
      { headers: sbHeaders() }
    );
    const seedRows = await seedRes.json();
    const seed = Array.isArray(seedRows) && seedRows[0]?.seed;

    if (!seed) {
      // Games started before seeds existed, or resumed from an old saved
      // state. Nothing to replay against, so only the words are checked.
      const dictionary = await getDictionary();
      if (dictionary) {
        const badWords = plainWords.filter(w => !dictionary.has(w));
        if (badWords.length) {
          validation = { checked: true, noSeed: true, problems: badWords.map(w => `"${w}" is not in the dictionary`) };
        } else {
          validation = { checked: true, noSeed: true, problems: [] };
        }
      }
    } else {
      const dictionary = await getDictionary();
      const problems = validateGame(seed, plainWords, joker || null, dictionary);
      validation = { checked: true, noSeed: false, problems };
    }
  } catch (err) {
    console.error('Validation error:', err.message);
    validation = { checked: false, problems: [], error: err.message };
  }

  if (validation.problems.length > 0) {
    console.error('GAME VALIDATION FAILED', JSON.stringify({
      mode: VALIDATION_MODE,
      user_id: user.id,
      game_date: gameDate,
      score: recalculatedScore,
      words: plainWords,
      joker: joker || null,
      problems: validation.problems,
    }));
    if (VALIDATION_MODE === 'enforce') {
      return res.status(400).json({ error: 'Score could not be verified' });
    }
  } else if (validation.checked) {
    console.log('GAME VALIDATED', JSON.stringify({
      user_id: user.id, score: recalculatedScore, words: plainWords.length, noSeed: !!validation.noSeed,
    }));
  }

  const wordsPlayed = sanitisedHistory.length;
  const avg = wordsPlayed ? recalculatedScore / wordsPlayed : 0;
  const best = sanitisedHistory.reduce((b, h) => (h.score > (b?.score ?? -1) ? h : b), null);

  // ----- Already played this window? -----
  // Built from the player's own offset, so the window is their local
  // 11am–2pm rather than a fixed UTC block.
  const offsetMins = typeof utc_offset === 'number' ? utc_offset : 0;
  const nowLocal = new Date(Date.now() + offsetMins * 60000);
  const windowStartLocal = new Date(nowLocal);
  windowStartLocal.setUTCHours(11, 0, 0, 0);
  const windowEndLocal = new Date(nowLocal);
  windowEndLocal.setUTCHours(14, 0, 0, 0);
  const windowStart = new Date(windowStartLocal.getTime() - offsetMins * 60000);
  const windowEnd = new Date(windowEndLocal.getTime() - offsetMins * 60000);

  // This check is a fast path, not the guarantee — two requests can both
  // pass it before either has inserted (a slow save that the client retries
  // is exactly how this happens). The database-level unique index below on
  // (user_id, play_date) is what actually makes a second row impossible;
  // this just avoids the round trip when it's obviously unnecessary.
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=in.(completed,freeze)&played_at=gte.${windowStart.toISOString()}&played_at=lte.${windowEnd.toISOString()}&select=id`,
    { headers: sbHeaders() }
  );
  const existing = await existingRes.json();
  if (Array.isArray(existing) && existing.length > 0) {
    return res.status(409).json({ error: 'Already played today' });
  }

  const prevRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=eq.completed&select=total_score&order=total_score.desc&limit=1`,
    { headers: sbHeaders() }
  );
  const prevData = await prevRes.json();
  const prevBest = prevData?.[0]?.total_score ?? 0;
  const isPersonalBest = recalculatedScore > prevBest;

  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=eq.completed&select=id`,
    { headers: sbHeaders({ Prefer: 'count=exact', Range: '0-0' }) }
  );
  const countHeader = countRes.headers.get('content-range');
  const prevCount = countHeader ? parseInt(countHeader.split('/')[1]) || 0 : 0;

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/game_results`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
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
    // 23505 = unique_violation. This is the database catching the exact race
    // the pre-check above can miss — a second request that reached here
    // milliseconds after the first. The first save already went through, so
    // this is success from the player's point of view, not a failure.
    if (insertRes.status === 409 || err.includes('23505') || err.includes('duplicate key')) {
      console.log('Duplicate save blocked by constraint for user', user.id);
      return res.status(409).json({ error: 'Already played today' });
    }
    console.error('Insert failed:', err);
    return res.status(500).json({ error: 'Could not save score' });
  }

  if (typeof utc_offset === 'number') {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ utc_offset }),
    });
  }

  return res.status(200).json({
    score: recalculatedScore,
    isPersonalBest,
    prevPlayed: prevCount,
    newPlayed: prevCount + 1,
    verified: validation.checked && validation.problems.length === 0,
  });
}
