// api/contact.js
// Receives contact form submissions and sends via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = 'anthonyehamilton93@gmail.com';
const FROM_EMAIL = 'Elevensies Feedback <noreply@playelevensies.com>';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message required' });

  const subject = `Elevensies Feedback${name ? ' from ' + name : ''}`;
  const text = `${name ? 'Name: ' + name + '\n' : ''}${email ? 'Email: ' + email + '\n' : ''}Message:\n${message}`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], subject, text }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Contact error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
