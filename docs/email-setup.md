# DeckPilot AI official email setup

Target address: `service@deckevo.com`

The application is ready to send login verification codes from `service@deckevo.com`, but the mailbox itself must be configured outside the codebase.

## What is already implemented

- Footer and legal pages show `service@deckevo.com`.
- Login requires a 6-digit verification code.
- SMTP sending is supported through these environment variables:

```env
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=service@deckevo.com
SMTP_PASS=your_smtp_password
SMTP_FROM="DeckPilot AI <service@deckevo.com>"
EMAIL_DEV_CODE=0
```

`EMAIL_DEV_CODE=1` is only a temporary testing mode. It returns the code to the frontend instead of sending a real email.

## Receiving email

Use one of these:

- Cloudflare Email Routing: create `service@deckevo.com` and forward it to an existing inbox.
- Zoho Mail / Google Workspace / Fastmail / Proton Mail: create a real mailbox for `service@deckevo.com`.

Cloudflare Email Routing is useful for receiving and forwarding email, but it does not provide normal outgoing SMTP. If you use Cloudflare for receiving, you still need a sender such as Resend, Postmark, Zoho, Google Workspace, or another SMTP provider for verification codes.

## DNS checklist

Add the provider's DNS records in Cloudflare DNS:

- MX records for receiving mail.
- SPF TXT record for sending authorization.
- DKIM TXT or CNAME record from the sending provider.
- DMARC TXT record, for example:

```txt
_dmarc.deckevo.com  TXT  "v=DMARC1; p=none; rua=mailto:service@deckevo.com"
```

## VPS checklist

After SMTP is ready, update `/home/deckpilot/apps/deckpilot-ai/.env.local` on the VPS:

```env
EMAIL_DEV_CODE=0
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=service@deckevo.com
SMTP_PASS=...
SMTP_FROM="DeckPilot AI <service@deckevo.com>"
```

Then restart:

```sh
sudo systemctl restart deckpilot-ai
```

Run:

```sh
npm run audit:prepayment
```

The mailbox check should pass after MX records propagate.
