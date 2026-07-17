// api/save-eliminator.js
// Saves a completed Eliminator session result.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const jwt = authHeader.replace('Bearer ', '');

  // Verify JWT
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

  const { rounds_survived, total_points } = req.body;

  if (typeof rounds_survived !== 'number' || rounds_survived < 0 || rounds_survived > 11) {
    return res.status(400).json({ error: 'Invalid rounds_survived' });
  }
  if (typeof total_points !== 'number' || total_points < 0) {
    return res.status(400).json({ error: 'Invalid total_points' });
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/eliminator_results`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: user.id,
      rounds_survived,
      total_points,
      played_at: new Date().toISOString(),
    }),
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error('Eliminator insert failed:', err);
    return res.status(500).json({ error: 'Could not save result' });
  }

  return res.status(200).json({ ok: true });
}
