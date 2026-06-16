#!/usr/bin/env bash
# CodeDeploy AfterInstall: instala dependencias y compila en la instancia.
set -euo pipefail
cd /opt/lalupa2

# systemd unit (idempotente)
cp deploy/lalupa2.service /etc/systemd/system/lalupa2.service
systemctl daemon-reload

# build de producción
npm ci
npm run build
