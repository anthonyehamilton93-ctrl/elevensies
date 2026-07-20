// api/league.js — handles all league actions: create, join, leave, delete, remove-member
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const db = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers, ...opts }).then(r => r.json());
const dbDelete = (path) => fetch(`${SUPABASE_URL}/rest/v1${path}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } });

async function getUser(jwt) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

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
  const user = await getUser(jwt);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { action, name, join_code, league_name, league_id, user_id_to_remove } = req.body;

  // ── CREATE ──
  if (action === 'create') {
    if (!name?.trim() || name.trim().length > 11) {
      return res.status(400).json({ error: 'League name must be 1–11 characters' });
    }
    const memberOf = await db(`/league_members?user_id=eq.${user.id}&select=league_id`);
    if (memberOf.length >= 11) return res.status(400).json({ error: 'You can only be in 11 leagues at once' });

    let code = null;
    for (let i = 0; i < 20; i++) {
      const c = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
      const ex = await db(`/leagues?join_code=eq.${c}&select=id`);
      if (!ex?.length) { code = c; break; }
    }
    if (!code) return res.status(500).json({ error: 'Could not generate a unique password. Try again.' });

    const [league] = await db('/leagues', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim().toUpperCase(), join_code: code, created_by: user.id }),
    });
    if (!league?.id) return res.status(500).json({ error: 'Could not create league' });
    await db('/league_members', { method: 'POST', body: JSON.stringify({ league_id: league.id, user_id: user.id }) });
    return res.status(200).json({ league });
  }

  // ── JOIN ──
  if (action === 'join') {
    if (!join_code || !league_name) return res.status(400).json({ error: 'League name and password required' });
    const leagues = await db(`/leagues?join_code=eq.${join_code.toUpperCase().trim()}&name=eq.${encodeURIComponent(league_name.toUpperCase().trim())}&select=id,name,created_by`);
    if (!leagues?.length) return res.status(404).json({ error: 'League not found — check the name and password' });
    const league = leagues[0];
    const members = await db(`/league_members?league_id=eq.${league.id}&select=user_id`);
    if (members.length >= 11) return res.status(400).json({ error: 'This league is full (11 members max)' });
    if (members.find(m => m.user_id === user.id)) return res.status(409).json({ error: 'Already a member' });
    const memberOf = await db(`/league_members?user_id=eq.${user.id}&select=league_id`);
    if (memberOf.length >= 11) return res.status(400).json({ error: 'You can only be in 11 leagues at once' });
    await db('/league_members', { method: 'POST', body: JSON.stringify({ league_id: league.id, user_id: user.id }) });
    return res.status(200).json({ league });
  }

  // ── LEAVE / REMOVE MEMBER ──
  if (action === 'leave') {
    if (!league_id) return res.status(400).json({ error: 'league_id required' });
    const targetUserId = user_id_to_remove || user.id;
    if (user_id_to_remove && user_id_to_remove !== user.id) {
      const leagues = await db(`/leagues?id=eq.${league_id}&select=created_by`);
      if (!leagues?.[0] || leagues[0].created_by !== user.id) {
        return res.status(403).json({ error: 'Only the league admin can remove members' });
      }
    }
    await dbDelete(`/league_members?league_id=eq.${league_id}&user_id=eq.${targetUserId}`);
    return res.status(200).json({ ok: true });
  }

  // ── DELETE ──
  if (action === 'delete') {
    if (!league_id) return res.status(400).json({ error: 'league_id required' });
    const leagues = await db(`/leagues?id=eq.${league_id}&select=created_by`);
    if (!leagues?.[0]) return res.status(404).json({ error: 'League not found' });
    if (leagues[0].created_by !== user.id) return res.status(403).json({ error: 'Only the admin can delete this league' });
    await dbDelete(`/leagues?id=eq.${league_id}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
