#!/usr/bin/env bash
# CodeDeploy ApplicationStop: detiene el servicio (no falla si no existe aún).
systemctl stop lalupa2 2>/dev/null || true
