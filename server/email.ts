import nodemailer from "nodemailer";

export type LoginCodeDelivery = {
  sent: boolean;
  devCode?: string;
};

export async function sendLoginCodeEmail(email: string, code: string): Promise<LoginCodeDelivery> {
  if (!hasSmtpConfig()) {
    if (shouldExposeDevCode()) {
      return { sent: false, devCode: code };
    }
    throw new Error("Email delivery is not configured yet. Configure SMTP settings before requiring verification codes.");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "1",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "DeckPilot AI <service@deckevo.com>",
    to: email,
    subject: "DeckPilot AI 登录验证码",
    text: `你的 DeckPilot AI 登录验证码是 ${code}。验证码 10 分钟内有效。`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">
        <p>你的 DeckPilot AI 登录验证码是：</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
        <p>验证码 10 分钟内有效。如果不是你本人操作，可以忽略这封邮件。</p>
      </div>
    `,
  });

  return { sent: true };
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST);
}

function shouldExposeDevCode() {
  return process.env.EMAIL_DEV_CODE === "1" || process.env.NODE_ENV !== "production";
}
