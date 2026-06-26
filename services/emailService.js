import nodemailer from 'nodemailer';

// One shared transporter, built from env. Used by every email flow (verification
// codes now; password reset / change email later). Keep the helpers generic.
let transporter;
function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 465,
            secure: Number(process.env.SMTP_PORT) !== 587, // 465 = SSL, 587 = STARTTLS
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }
    return transporter;
}

// Generic send — any future flow can call this directly.
async function sendMail({ to, subject, text, html }) {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    return getTransporter().sendMail({ from, to, subject, text, html });
}

// Reusable: a one-time verification code (register / reset / change email).
async function sendVerificationCode(to, code) {
    return sendMail({
        to,
        subject: 'Your Tradi verification code',
        text: `Your verification code is ${code}. It expires in 10 minutes.`,
        html: `<p>Your verification code is <b style="font-size:18px">${code}</b>.</p><p>It expires in 10 minutes.</p>`,
    });
}

// Sent when the platform admin approves a tenant registration.
async function sendRegistrationApproved(to, name) {
    return sendMail({
        to,
        subject: 'Welcome to Tradi — your account is ready',
        text: `Hello ${name}, we have registered your clinic successfully. Please contact us on WhatsApp for full details.`,
        html: `<p>Hello ${name},</p>
               <p>We have registered your clinic successfully 🎉</p>
               <p>Please contact us on <b>WhatsApp</b> for full details and onboarding.</p>
               <p>— Tradi Company</p>`,
    });
}

export default { sendMail, sendVerificationCode, sendRegistrationApproved };
