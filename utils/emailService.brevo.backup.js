// utils/emailService.js — Resend version
const { Resend } = require('resend');
const ejs = require('ejs');
const path = require('path');

let resend = null;

const initResend = () => {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not set — emails will be logged, not sent');
      return null;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const FROM = () =>
  process.env.EMAIL_FROM || 'FineEscorts Kenya <onboarding@resend.dev>';

// Render an EJS template from emailTemplates/<name>.ejs
const renderTemplate = async (templateName, data) => {
  const templatePath = path.join(__dirname, '..', 'emailTemplates', `${templateName}.ejs`);
  return await ejs.renderFile(templatePath, data);
};

const sendEmail = async (to, subject, templateName, data = {}) => {
  try {
    const client = initResend();

    // Dev fallback: log instead of sending
    if (!client) {
      console.log('📧 [DEV] Email would be sent:');
      console.log('  To:', to);
      console.log('  From:', FROM());
      console.log('  Subject:', subject);
      console.log('  Template:', templateName);
      console.log('  Data:', data);
      return { success: true, test: true };
    }

    const html = await renderTemplate(templateName, data);

    const result = await client.emails.send({
      from: FROM(),
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error(`❌ Resend error (${templateName} → ${to}):`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`✅ Email sent (${templateName} → ${to}):`, result.data?.id);
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

// ─── Specific Email Functions (same signatures as before) ─────────

const sendWelcomeEmail = async (email, name) => {
  return await sendEmail(email, 'Welcome to FineEscorts Kenya!', 'welcome', { name });
};

const sendApprovalEmail = async (email, name, status, slug, reason = '') => {
  return await sendEmail(email, `Profile ${status}`, 'approval', {
    name,
    status,
    slug,
    reason,
  });
};

const sendPaymentConfirmation = async (email, name, amount, plan, transactionId) => {
  return await sendEmail(email, 'Payment Confirmed - Profile Active!', 'paymentConfirm', {
    name,
    amount,
    plan,
    transactionId,
  });
};

const sendSubscriptionExpiredEmail = async (email, name, plan, expiryDate, renewalLink) => {
  return await sendEmail(
    email,
    '⚠️ Your Subscription Has Expired - Renew Now!',
    'expiry',
    { name, plan, expiryDate, renewalLink }
  );
};

const sendAdminBulkEmail = async (email, name, subject, message) => {
  return await sendEmail(
    email,
    subject || 'Message from FineEscorts Admin',
    'admin-bulk',
    { name, message }
  );
};

const sendAdminNewSignupNotification = async (profile) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'info@fineescorts.co.ke';
  return await sendEmail(
    adminEmail,
    '🆕 New Escort Signup – Pending Approval',
    'admin-new-signup',
    {
      displayName: profile.displayName || profile.name,
      email: profile.email || 'N/A',
      location: profile.city || profile.location || 'N/A',
      age: profile.age || 'N/A',
      phone: profile.phone || 'N/A',
      services: profile.services ? profile.services.join(', ') : 'Not specified',
    }
  );
};

module.exports = {
  sendWelcomeEmail,
  sendApprovalEmail,
  sendPaymentConfirmation,
  sendSubscriptionExpiredEmail,
  sendAdminBulkEmail,
  sendAdminNewSignupNotification,
  sendEmail,
};