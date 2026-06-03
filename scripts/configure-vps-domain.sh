#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash scripts/configure-vps-domain.sh your-domain.com" >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

APP_DIR="/home/deckpilot/apps/deckpilot-ai"
ENV_FILE="$APP_DIR/.env.local"
TMP_DOMAIN="deckpilot.70.34.216.237.sslip.io"
PUBLIC_IP="${PUBLIC_IP:-70.34.216.237}"
ORIGINS="https://${DOMAIN},https://www.${DOMAIN},https://api.${DOMAIN},https://${TMP_DOMAIN},https://deckpilot-ai.netlify.app"

python3 - "$ENV_FILE" "$ORIGINS" "https://${DOMAIN}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
frontends = sys.argv[2]
app_origin = sys.argv[3]
updates = {
    "FRONTEND_ORIGIN": frontends,
    "APP_ORIGIN": app_origin,
    "COOKIE_SAME_SITE": "none",
}

lines = path.read_text().splitlines() if path.exists() else []
seen = set()
next_lines = []
for line in lines:
    key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
    if key in updates:
        next_lines.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        next_lines.append(line)

for key, value in updates.items():
    if key not in seen:
        next_lines.append(f"{key}={value}")

path.write_text("\n".join(next_lines) + "\n")
PY

cat > /etc/nginx/sites-available/deckpilot-ai <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN} api.${DOMAIN} ${TMP_DOMAIN};

    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/deckpilot-ai /etc/nginx/sites-enabled/deckpilot-ai
nginx -t
systemctl reload nginx

cert_domains=()
for host in "$DOMAIN" "www.$DOMAIN" "api.$DOMAIN"; do
  if getent ahostsv4 "$host" | awk '{print $1}' | grep -qx "$PUBLIC_IP"; then
    cert_domains+=("-d" "$host")
  else
    echo "Skipping certificate name ${host}: DNS does not resolve to ${PUBLIC_IP} yet."
  fi
done

if [[ "${#cert_domains[@]}" -eq 0 ]]; then
  echo "No ${DOMAIN} DNS records resolve to ${PUBLIC_IP} yet. Add A records in Cloudflare, then rerun." >&2
  exit 1
fi

certbot --nginx "${cert_domains[@]}" --non-interactive --agree-tos --register-unsafely-without-email --redirect
systemctl restart deckpilot-ai
nginx -t
systemctl reload nginx

echo "Configured https://${DOMAIN}"
