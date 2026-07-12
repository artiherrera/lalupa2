#!/usr/bin/env bash
# Bootstrap de La Lupa en EC2 (Amazon Linux 2023).
# Uso (como root o con sudo):   bash setup.sh <git-repo-url>
# Despliegues posteriores:      bash setup.sh   (sin args, hace pull + build + restart)
set -euo pipefail

APP_DIR=/opt/lalupa2
REPO_URL="${1:-}"

echo "== Dependencias (Node 22, git, nginx) =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
fi
dnf install -y nodejs git nginx

echo "== Código =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
elif [ -n "$REPO_URL" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "ERROR: no existe $APP_DIR y no diste <git-repo-url>." >&2
  exit 1
fi

cd "$APP_DIR"
if [ ! -f .env.local ]; then
  echo "!! Falta $APP_DIR/.env.local con DATABASE_URL. Créalo antes de arrancar:" >&2
  echo "   echo 'DATABASE_URL=postgresql://postgres:PASS@HOST:5432/lalupa?sslmode=no-verify' > $APP_DIR/.env.local" >&2
fi

echo "== Build =="
npm ci
npm run build

echo "== systemd =="
cp deploy/lalupa2.service /etc/systemd/system/lalupa2.service
systemctl daemon-reload
systemctl enable --now lalupa2
systemctl restart lalupa2

echo "== nginx (80 -> 3000) =="
cat > /etc/nginx/conf.d/lalupa2.conf <<'NGINX'
server {
  listen 80 default_server;
  server_name _;

  # Cargas de CSV grandes (ETL de contratos) por /admin/cargar.
  client_max_body_size 512m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # El ETL procesa el CSV en streaming y puede tardar minutos: no cortar.
    proxy_request_buffering off;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;
  }
}
NGINX
# quita el server por defecto de nginx si existe
sed -i 's/^\(\s*listen\s*80;\)/#\1/' /etc/nginx/nginx.conf || true
systemctl enable --now nginx
nginx -t && systemctl restart nginx

echo "== Listo. Estado: =="
systemctl --no-pager status lalupa2 | head -5
