// api/delete-account.js
// Called directly from the game (a "Delete my account" button in the account panel).
// Deletes the user from Supabase Auth and sends a confirmation email.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';

function confirmHTML(email) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deleted - Elevensies</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">
        <tr><td align="center" style="padding:44px 40px 20px 40px;">
          <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;text-transform:uppercase;">ELEVENSIES</h1>
        </td></tr>
        <tr><td style="padding:0 40px 32px;text-align:center;">
          <h2 style="font-family:'Jost',sans-serif;font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Your account has been deleted.</h2>
          <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0;">
            All data linked to <strong>${email}</strong> — your profile, scores, and game history — has been permanently removed. You won't hear from us again.
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">If you change your mind, you can always create a new account at playelevensies.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Allow DELETE or POST
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  // The game sends the user's JWT — verify it with Supabase to get their ID
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No auth token' });

  try {
    // Verify the user's token and get their details
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: authHeader },
    });
    const user = await userRes.json();
    if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

    // Delete from Supabase Auth (cascades to profiles + game_results)
    const deleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!deleteRes.ok) throw new Error('Delete failed');

    // Send confirmation email
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: user.email,
        subject: 'Your Elevensies account has been deleted',
        html: confirmHTML(user.email),
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return res.status(500).json({ error: err.message });
  }
}
