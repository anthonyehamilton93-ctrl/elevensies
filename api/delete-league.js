// api/delete-league.js
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

  const { league_id } = req.body;
  if (!league_id) return res.status(400).json({ error: 'league_id required' });

  // Verify requester is the admin
  const leagues = await fetch(
    `${SUPABASE_URL}/rest/v1/leagues?id=eq.${league_id}&select=created_by`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  ).then(r => r.json());

  if (!leagues?.[0]) return res.status(404).json({ error: 'League not found' });
  if (leagues[0].created_by !== user.id) return res.status(403).json({ error: 'Only the admin can delete this league' });

  // Delete league (members cascade)
  await fetch(
    `${SUPABASE_URL}/rest/v1/leagues?id=eq.${league_id}`,
    { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: 'return=minimal' } }
  );

  return res.status(200).json({ ok: true });
}
