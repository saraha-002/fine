const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');

// Create transporter (will be configured later)
let transporter = null;

const initTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp-relay.sendinblue.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

// Helper to render EJS templates
const renderTemplate = async (templateName, data) => {
  const templatePath = path.join(__dirname, '..', 'emailTemplates', `${templateName}.ejs`);
  return await ejs.renderFile(templatePath, data);
};

// Send email function
const sendEmail = async (to, subject, templateName, data = {}) => {
  try {
    const transporter = initTransporter();
    
    // Render the email body
    const html = await renderTemplate(templateName, data);
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'info@fineescorts.co.ke',
      to,
      subject,
      html,
    };

    // For testing: log instead of sending
    if (process.env.NODE_ENV === 'development' || !process.env.SMTP_USER) {
      console.log('📧 Email would be sent:');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log('Template:', templateName);
      console.log('Data:', data);
      console.log('---');
      return { success: true, test: true };
    }

    // Actually send email
    const info = await transporter.sendMail(mailOptions);
    return { success: true, info };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

// ─── Specific Email Functions ────────────────────────────────────

const sendWelcomeEmail = async (email, name) => {
  return await sendEmail(email, 'Welcome to FineEscorts Kenya!', 'welcome', { name });
};

const sendApprovalEmail = async (email, name, status, slug, reason = '') => {
  return await sendEmail(email, `Profile ${status}`, 'approval', { 
    name, 
    status, 
    slug,
    reason 
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

// ─── Admin Bulk Email ─────────────────────────────────────────────
const sendAdminBulkEmail = async (email, name, subject, message) => {
  return await sendEmail(
    email,
    subject || 'Message from FineEscorts Admin',
    'admin-bulk',
    { name, message }
  );
};

// ─── Admin Notification ──────────────────────────────────────────
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
            services: profile.services ? profile.services.join(', ') : 'Not specified'
        }
    );
};

// ─── Single Export ─────────────────────────────────────────────────
module.exports = {
  sendWelcomeEmail,
  sendApprovalEmail,
  sendPaymentConfirmation,
  sendSubscriptionExpiredEmail,
  sendAdminBulkEmail,
  sendAdminNewSignupNotification,  // ← ADDED
  sendEmail,
};