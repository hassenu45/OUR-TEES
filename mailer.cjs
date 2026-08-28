// Campaign email sender.
// Uses nodemailer + SMTP credentials from environment variables. If SMTP is not
// configured, emails are "simulated" (logged to console) so the flow can be
// developed/tested without a live mail server. The other channels (WhatsApp,
// Instagram, Messenger, SMS) are intentionally not implemented yet.
let cachedTransporter = null;

function loadNodemailer() {
  // Lazy require so the server never crashes at startup if nodemailer is absent.
  return require('nodemailer');
}

function getConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  };
}

function isConfigured() {
  const c = getConfig();
  return !!(c.host && c.user);
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const c = getConfig();
  const nodemailer = loadNodemailer();
  cachedTransporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
  });
  return cachedTransporter;
}

// Send a single campaign email. Returns { ok, simulated, error }.
async function sendCampaignEmail({ to, subject, html, text }) {
  if (!to) return { ok: false, error: 'no recipient' };
  const c = getConfig();
  const content = text || (html ? html.replace(/<[^>]*>/g, ' ') : '');

  if (!isConfigured()) {
    console.log(`[CAMPAIGN-SIM] -> ${to} | subject: ${subject}`);
    return { ok: true, simulated: true };
  }

  try {
    await getTransporter().sendMail({
      from: c.from,
      to,
      subject,
      text: content,
      html: html || undefined,
    });
    return { ok: true, simulated: false };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendCampaignEmail, isConfigured, getConfig };
