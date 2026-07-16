// api/apply-freeze.js
// When a player uses a lifeline, delete their completed game result
// for the target date so it no longer counts toward their average.
// Uses the service key — client cannot delete rows directly.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the user's JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const jwt = authHeader.replace('Bearer ', '');

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const user = await userRes.json();
  if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

  const { targetDate } = req.body;
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return res.status(400).json({ error: 'Invalid targetDate' });
  }

  // Delete any completed game result for this user on the target date
  const deleteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/game_results?user_id=eq.${user.id}&game_status=eq.completed&played_at=gte.${targetDate}T00:00:00.000Z&played_at=lt.${targetDate}T23:59:59.999Z`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
    }
  );

  if (!deleteRes.ok) {
    const err = await deleteRes.text();
    console.error('Delete failed:', err);
    return res.status(500).json({ error: 'Could not delete completed row' });
  }

  return res.status(200).json({ ok: true });
}
