// api/join-league.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const db = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1${path}`, {
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers },
  ...opts,
}).then(r => r.json());

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

  const { join_code, league_name } = req.body;
  if (!join_code || !league_name) return res.status(400).json({ error: 'League name and password required' });

  // Match both name and code
  const leagues = await db(
    `/leagues?join_code=eq.${join_code.toUpperCase().trim()}&name=eq.${encodeURIComponent(league_name.toUpperCase().trim())}&select=id,name,created_by`
  );
  if (!leagues?.length) return res.status(404).json({ error: 'League not found — check the name and password' });
  const league = leagues[0];

  const members = await db(`/league_members?league_id=eq.${league.id}&select=user_id`);
  if (members.length >= 11) return res.status(400).json({ error: 'This league is full (11 members max)' });
  if (members.find(m => m.user_id === user.id)) return res.status(409).json({ error: 'Already a member' });

  const memberOf = await db(`/league_members?user_id=eq.${user.id}&select=league_id`);
  if (Array.isArray(memberOf) && memberOf.length >= 11) {
    return res.status(400).json({ error: 'You can only be in 11 leagues at once' });
  }

  await db('/league_members', {
    method: 'POST',
    body: JSON.stringify({ league_id: league.id, user_id: user.id }),
  });

  return res.status(200).json({ league });
}
