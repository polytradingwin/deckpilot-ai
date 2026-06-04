import nodemailer from "nodemailer";

export type LoginCodeDelivery = {
  sent: boolean;
  devCode?: string;
  provider?: string;
};

const loginCodeSubject = "DeckEvo 登录验证码";

export async function sendLoginCodeEmail(email: string, code: string): Promise<LoginCodeDelivery> {
  if (hasResendConfig()) {
    await sendWithResend(email, code);
    return { sent: true, provider: "resend" };
  }

  if (hasSmtpConfig()) {
    await sendWithSmtp(email, code);
    return { sent: true, provider: "smtp" };
  }

  if (shouldExposeDevCode()) {
    return { sent: false, devCode: code, provider: "development" };
  }

  throw new Error("Email delivery is not configured yet. Configure Resend or SMTP settings before requiring verification codes.");
}

export function getEmailDeliveryMode() {
  if (hasResendConfig()) return "resend";
  if (hasSmtpConfig()) return "smtp";
  if (shouldExposeDevCode()) return "development";
  return "missing";
}

async function sendWithSmtp(email: string, code: string) {
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
    from: getMailFrom(),
    to: email,
    subject: loginCodeSubject,
    text: loginCodeText(code),
    html: loginCodeHtml(code),
  });
}

async function sendWithResend(email: string, code: string) {
  const response = await fetch(`${process.env.RESEND_BASE_URL || "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getMailFrom(),
      to: [email],
      subject: loginCodeSubject,
      text: loginCodeText(code),
      html: loginCodeHtml(code),
    }),
  });

  if (!response.ok) {
    let detail = `Resend returned ${response.status}.`;
    try {
      const payload = (await response.json()) as { message?: string; name?: string };
      detail = payload.message || payload.name || detail;
    } catch {
      detail = await response.text().catch(() => detail);
    }
    throw new Error(`Resend email delivery failed: ${detail}`);
  }
}

function loginCodeText(code: string) {
  return `你的 DeckEvo 登录验证码是 ${code}。验证码 10 分钟内有效。如果不是你本人操作，可以忽略这封邮件。`;
}

function loginCodeHtml(code: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">
      <p>你的 DeckEvo 登录验证码是：</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
      <p>验证码 10 分钟内有效。如果不是你本人操作，可以忽略这封邮件。</p>
    </div>
  `;
}

function getMailFrom() {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || "DeckEvo <service@deckevo.com>";
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY);
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST);
}

function shouldExposeDevCode() {
  return process.env.EMAIL_DEV_CODE === "1" || process.env.NODE_ENV !== "production";
}
