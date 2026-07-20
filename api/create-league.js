// api/create-league.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const db = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1${path}`, {
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
  ...opts,
}).then(r => r.json());

const CODE_WORDS = [
  'APPLICATION','BUTTERFLIES','BROADCASTER','CELEBRATION','CHALLENGING',
  'COMBINATION','COMFORTABLE','COMPETITION','COMPLICATED','CONCENTRATE',
  'CONSIDERING','COOPERATION','CORPORATION','COUNTRYSIDE','DESCRIPTION',
  'DEVELOPMENT','DIFFERENTLY','DISTINCTION','EDUCATIONAL','ENGINEERING',
  'ENVIRONMENT','ESTABLISHED','EXAMINATION','EXPLANATION','FASCINATING',
  'FUNDAMENTAL','GOVERNMENTS','GRANDFATHER','GRANDMOTHER','HANDWRITING',
  'IMAGINATION','IMMEDIATELY','IMPROVEMENT','INFORMATION','INTERESTING',
  'INVOLVEMENT','NECESSARILY','OUTSTANDING','PARTNERSHIP','PERFORMANCE',
  'PERSONALITY','PERSPECTIVE','POSSIBILITY','PREPARATION','PROGRAMMING',
  'RECOGNITION','RECOMMENDED','RESPONSIBLE','RESTRICTION','SURROUNDING',
  'SYMPATHETIC','TEMPERATURE','THREATENING','TRANSLATION','UNCERTAINTY',
  'UNDERGROUND','UNFORTUNATE','UNNECESSARY','VOLUNTARILY','WONDERFULLY',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const jwt = req.headers.authorization?.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Unauthorized' });
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 11) {
    return res.status(400).json({ error: 'League name must be 1-11 characters' });
  }

  const memberCount = await fetch(
    `${SUPABASE_URL}/rest/v1/league_members?user_id=eq.${user.id}&select=league_id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  ).then(r => r.json());
  if (Array.isArray(memberCount) && memberCount.length >= 11) {
    return res.status(400).json({ error: 'You can only be in 11 leagues at once' });
  }

  let join_code = null;
  for (let i = 0; i < 20; i++) {
    const candidate = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
    const existing = await fetch(
      `${SUPABASE_URL}/rest/v1/leagues?join_code=eq.${candidate}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    ).then(r => r.json());
    if (!existing?.length) { join_code = candidate; break; }
  }
  if (!join_code) return res.status(500).json({ error: 'Could not generate a unique code. Try again.' });

  const [league] = await db('/leagues', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim().toUpperCase(), join_code, created_by: user.id }),
  });
  if (!league?.id) return res.status(500).json({ error: 'Could not create league' });

  await db('/league_members', {
    method: 'POST',
    body: JSON.stringify({ league_id: league.id, user_id: user.id }),
  });

  return res.status(200).json({ league });
}
