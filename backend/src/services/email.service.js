import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { rememberOutboundEmail } from "../utils/emailOutbox.js";

function wrap(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#f4f1ea;font-family:Georgia,serif;color:#1c2b33;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fffdf8;border:1px solid #e4ddd3;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0b3d4a;color:#e8f4f2;padding:22px 28px;">
          <div style="letter-spacing:0.18em;font-size:11px;text-transform:uppercase;opacity:.8;">MediConnect AI</div>
          <div style="font-size:20px;margin-top:6px;">${title}</div>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;font-size:12px;color:#6b7c80;border-top:1px solid #eee8dc;">
          Connected care network · Do not share this message if you did not expect it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

let transporter;
function getTransport() {
  if (transporter) return transporter;
  if (env.email.host && env.email.user) {
    transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: { user: env.email.user, pass: env.email.password },
    });
  }
  return transporter;
}

// Verify SMTP connection once at startup (non-blocking). Never logs credentials.
export function verifySMTPConnection() {
  const transport = getTransport();
  if (!transport) {
    console.log("[email] No SMTP configured — using development outbox fallback.");
    return;
  }
  transport.verify((err) => {
    if (err) {
      const safe = String(err.message || "unknown").replace(/password[^\s]*/gi, "[redacted]");
      console.error("[email] SMTP connection failed:", safe);
    } else {
      console.log("[email] SMTP transporter verified successfully.");
    }
  });
}

export async function sendMail({ to, subject, html, text, meta }) {
  const payload = { from: env.email.from, to, subject, html, text };
  rememberOutboundEmail({ to, subject, text, meta });
  const transport = getTransport();
  if (!transport) {
    // Development fallback — subject is logged but email body/OTP value is NOT.
    const maskedTo = String(to).replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, "*") + c);
    console.log(`[email:dev] Would send "${subject}" to ${maskedTo}`);
    return { queued: false, stored: true };
  }
  await transport.sendMail(payload);
  return { queued: true };
}

export async function sendFacilityRegistered(to, facilityName) {
  return sendMail({
    to,
    subject: `Facility registration received — ${facilityName}`,
    html: wrap("Registration received", `<p>Thank you for registering <strong>${facilityName}</strong> on MediConnect AI.</p><p>Your facility is now <strong>pending verification</strong>. A government administrator will review licence and contact details. You will be notified when the status changes.</p>`),
    text: `Registration received for ${facilityName}. Status: pending verification.`,
  });
}

export async function sendVerificationResult(to, facilityName, verified, reason) {
  const status = verified ? "verified" : "not approved";
  return sendMail({
    to,
    subject: `Facility ${status} — ${facilityName}`,
    html: wrap(
      verified ? "Facility verified" : "Verification update",
      verified
        ? `<p><strong>${facilityName}</strong> is now a verified MediConnect facility. You may add doctors, manage appointments, and operate the provider portal.</p>`
        : `<p>Verification for <strong>${facilityName}</strong> was not approved.</p><p>${reason || ""}</p>`
    ),
    text: `${facilityName} ${status}. ${reason || ""}`,
  });
}

export async function sendDoctorInvitation({ to, facilityName, doctorName, link, expiresHours }) {
  return sendMail({
    to,
    subject: `${facilityName} invited you to join MediConnect AI`,
    html: wrap(
      "Doctor invitation",
      `<p>${facilityName} has invited you to join as <strong>${doctorName}</strong>.</p>
       <p>This link is unique, time-limited (${expiresHours} hours), and single-use. It does not grant access to patient records until you create or link your account and accept the invitation.</p>
       <p><a href="${link}" style="display:inline-block;background:#0b3d4a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;">Review invitation</a></p>
       <p style="font-size:13px;color:#5b6b70;">If the button does not work, copy this URL:<br>${link}</p>`
    ),
    text: `${facilityName} invited ${doctorName}. Open: ${link} (expires in ${expiresHours} hours).`,
    meta: { kind: "INVITE", link },
  });
}

export async function sendOtpEmail(to, code, purpose) {
  // SECURITY: Subject does NOT include the OTP value to reduce exposure
  // via mobile notification previews and email subject indexing.
  const maskedTo = String(to).replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, "*") + c);
  const result = await sendMail({
    to,
    subject: "Your MediConnect verification code",
    html: wrap(
      "One-time verification code",
      `<p>Hello,</p>
       <p>Your MediConnect verification code is:</p>
       <p style="font-size:36px;letter-spacing:0.25em;font-weight:700;color:#0b3d4a;margin:20px 0;padding:16px 24px;background:#f0f8f6;border-radius:10px;display:inline-block;">${code}</p>
       <p>This code expires in <strong>${env.otpMinutes} minutes</strong>. Do not share this code with anyone.</p>
       <p style="color:#6b7c80;font-size:13px;">If you did not request this code, you can safely ignore this email.</p>
       <p>Regards,<br>MediConnect</p>`
    ),
    text: `Your MediConnect verification code is: ${code}\n\nThis code expires in ${env.otpMinutes} minutes.\nDo not share this code with anyone.\n\nIf you did not request this code, you can safely ignore this message.\n\nRegards,\nMediConnect`,
    meta: { kind: "OTP", purpose },
  });
  // Log masked recipient and purpose only — never the OTP value.
  console.log(`[otp] Verification email dispatched to ${maskedTo} for purpose: ${purpose}`);
  return result;
}

export async function sendPasswordReset(to, link) {
  return sendMail({
    to,
    subject: "Reset your MediConnect AI password",
    html: wrap("Password reset", `<p>Use the link below to choose a new password. It expires in one hour.</p><p><a href="${link}">Reset password</a></p>`),
    text: `Reset password: ${link}`,
    meta: { kind: "RESET", link },
  });
}

export async function sendReferralNotice(to, patientName, fromFacility) {
  return sendMail({
    to,
    subject: `Referral received — ${patientName}`,
    html: wrap("Referral notice", `<p>A referral for <strong>${patientName}</strong> was created from ${fromFacility}. Open the provider portal to review and accept.</p>`),
    text: `Referral for ${patientName} from ${fromFacility}.`,
  });
}

export async function sendAppointmentNotice(to, details) {
  return sendMail({
    to,
    subject: "Appointment update — MediConnect AI",
    html: wrap("Appointment update", `<p>${details}</p>`),
    text: details,
  });
}
