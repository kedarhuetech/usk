/**
 * Email Service with Nodemailer & Dev Mode Fallback
 * 
 * Sends branded verification OTP emails with Charcoal & Orange styling.
 * When SMTP credentials are not configured, gracefully logs OTP to server console
 * and provides safe dev mode diagnostics so registration works immediately.
 */

import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true, quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
dotenv.config({ quiet: true });

// Creates transporter based on environment configuration
function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS || "";
  // Gmail app passwords can contain spaces (e.g. 'tspz kbfl kkcx jidn') - strip spaces
  const pass = rawPass.replace(/\s+/g, "");

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return null;
}

/**
 * Sends a 6-digit verification code to the target email.
 * 
 * @param {Object} options
 * @param {string} options.to Recipient email address
 * @param {string} options.otp 6-digit OTP code
 * @param {string} [options.businessName] Optional business name
 * @returns {Promise<Object>}
 */
export async function sendOtpEmail({ to, otp, businessName = "Your Business" }) {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || '"USK Billing & ERP" <no-reply@uskbilling.com>';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; background-color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F3F4F6; }
        .container { max-width: 520px; margin: 30px auto; background-color: #1F2937; border: 1px solid #374151; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
        .header { background: linear-gradient(135deg, #161921 0%, #1F2937 100%); padding: 28px 24px; text-align: center; border-bottom: 2px solid #FF5A1F; }
        .brand { font-size: 24px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.5px; }
        .brand span { color: #FF5A1F; }
        .content { padding: 32px 28px; text-align: center; }
        .title { font-size: 20px; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #9CA3AF; margin-bottom: 24px; }
        .otp-box { background-color: #111827; border: 2px dashed #FF5A1F; border-radius: 8px; padding: 18px 24px; margin: 20px auto; display: inline-block; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #FF5A1F; letter-spacing: 8px; margin: 0; }
        .expiry { font-size: 12px; color: #6B7280; margin-top: 14px; }
        .footer { background-color: #161921; padding: 18px 24px; text-align: center; font-size: 12px; color: #4B5563; border-top: 1px solid #282F3E; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="brand">USK <span>Vyapaar</span></div>
        </div>
        <div class="content">
          <div class="title">Verify Your Business Email</div>
          <div class="text">
            Welcome to USK! Please use the 6-digit verification code below to verify your email address and complete your business workspace registration.
          </div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          <div class="expiry">⏱️ This verification code is valid for <strong>10 minutes</strong>. Never share this code with anyone.</div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} USK ERP & Business Accounting. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject: `${otp} is your USK verification code`,
        text: `Your USK verification code is: ${otp}. It expires in 10 minutes.`,
        html: htmlContent,
      });
      console.log(`[Email Service] Sent verification OTP to ${to} (Message ID: ${info.messageId})`);
      return { success: true, delivered: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[Email Service] SMTP delivery failed to ${to}:`, err.message);
      // Fall through to dev logging so user can still proceed
    }
  }

  // Dev mode / fallback: log prominently to server console
  console.log("\n=======================================================");
  console.log("📩 [EMAIL SERVICE - DEV MODE / CONSOLE OTP]");
  console.log(`   To:           ${to}`);
  console.log(`   OTP Code:     ${otp}`);
  console.log(`   Valid For:    10 minutes`);
  console.log(`   Reason:       SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in .env)`);
  console.log("=======================================================\n");

  return {
    success: true,
    delivered: false,
    devMode: true,
    previewOtp: otp, // surfaced in development response if needed
    message: "Verification OTP generated.",
  };
}
