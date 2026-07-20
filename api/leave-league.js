// api/leave-league.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

  const { league_id, user_id_to_remove } = req.body;
  if (!league_id) return res.status(400).json({ error: 'league_id required' });

  // If removing another user, verify requester is the admin
  const targetUserId = user_id_to_remove || user.id;
  if (user_id_to_remove && user_id_to_remove !== user.id) {
    const leagues = await fetch(
      `${SUPABASE_URL}/rest/v1/leagues?id=eq.${league_id}&select=created_by`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    ).then(r => r.json());
    if (!leagues?.[0] || leagues[0].created_by !== user.id) {
      return res.status(403).json({ error: 'Only the league admin can remove members' });
    }
  }

  await fetch(
    `${SUPABASE_URL}/rest/v1/league_members?league_id=eq.${league_id}&user_id=eq.${targetUserId}`,
    { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: 'return=minimal' } }
  );

  return res.status(200).json({ ok: true });
}
