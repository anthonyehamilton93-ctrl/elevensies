// api/welcome-email.js
// Called by a Supabase Database Webhook when a new row is inserted into `profiles`.
// Sends a welcome email via Resend.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FROM_EMAIL = 'Elevensies <noreply@playelevensies.com>';
const GAME_URL = 'https://playelevensies.com';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function welcomeHTML(displayName, userId) {
  const name = displayName && !displayName.startsWith('user') ? displayName : 'there';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Elevensies</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;700;900&display=swap');
    @font-face {
      font-family: 'Jost';
      font-weight: 400;
      src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Jost';
      font-weight: 700;
      src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Jost';
      font-weight: 900;
      src: url('https://fonts.gstatic.com/s/jost/v18/92zPtBhPNqw79Ij1E865zBUv7myjJAVGPokMmuTl.woff2') format('woff2');
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#1a6b3c;font-family:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#1a6b3c;padding:40px 20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:440px;background-color:#155c33;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);">
        <tr><td align="center" style="padding:44px 40px 20px 40px;">
          <h1 style="font-family:'Jost',sans-serif;font-size:32px;font-weight:800;color:#f0c020;margin:0;letter-spacing:0.1em;text-transform:uppercase;">ELEVENSIES</h1>
        </td></tr>
        <tr><td style="padding:0 40px;text-align:center;">
          <h2 style="font-family:'Jost',sans-serif;font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Welcome, ${name}.</h2>
          <p style="font-family:'Jost',sans-serif;font-size:15px;line-height:22px;color:#e2e8f0;margin:0 0 28px 0;">
            Your account is set up and your stats are ready to track. The game opens every day at 11am — 10 tiles, 11 turns, one shot at the leaderboard. Your score counts even if you don't finish, so make every word count.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:0 40px 28px 40px;">
          <a href="${GAME_URL}" style="display:inline-block;background-color:#f0c020;color:#155c33;font-family:'Jost',sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.02em;text-transform:uppercase;">Play Elevensies</a>
        </td></tr>
        <tr><td align="center" style="padding:0 40px 44px 40px;">
          <a href="${GAME_URL}/api/subscribe?uid=${userId}" style="display:inline-block;border:2px solid rgba(240,192,32,0.5);color:#f0c020;font-family:'Jost',sans-serif;font-size:13px;font-weight:700;text-decoration:none;padding:10px 24px;border-radius:8px;letter-spacing:0.08em;text-transform:uppercase;">🔔 Remind me at 11am</a>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#114b29;text-align:center;">
          <p style="font-family:'Jost',sans-serif;font-size:12px;line-height:18px;color:#8ba895;margin:0;">You're receiving this because you just created an Elevensies account. Check your junk folder for future emails!</p>
          <p style="font-family:'Jost',sans-serif;font-size:11px;line-height:16px;color:#6f8a78;margin:8px 0 0 0;"><a href="https://ksniuexnzikitbadttxx.supabase.co/storage/v1/object/public/Privacy%20Policy/elevensies_privacy_policy.pdf" style="color:#6f8a78;text-decoration:underline;">Privacy Policy</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-webhook-secret'];
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { record, old_record } = req.body;
    if (!record?.id || !record?.email) return res.status(400).json({ error: 'No record in payload' });

    // Only send the welcome email the moment email_confirmed_at transitions
    // from null to a value — i.e. right when they verify, not on signup.
    const justConfirmed = !old_record?.email_confirmed_at && record?.email_confirmed_at;
    if (!justConfirmed) {
      return res.status(200).json({ message: 'Not a confirmation event — skipped' });
    }

    // Fetch their display name from profiles
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${record.id}&select=display_name`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const profiles = await profileRes.json();
    const displayName = profiles?.[0]?.display_name || null;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: record.email,
        subject: 'Welcome to Elevensies',
        html: welcomeHTML(displayName, record.id),
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('welcome-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
