# Monitoreo de La Lupa

Dos piezas complementarias:

| Quieres saber…            | Herramienta                        | Dónde se ve                          |
| ------------------------- | ---------------------------------- | ------------------------------------ |
| **De dónde ingresan**     | Umami (analítica web sin cookies)  | `https://stats.lalupa.mx`            |
| **Qué buscan**            | Registro propio en Postgres        | `https://lalupa.mx/admin/stats?token=…` |

El registro de búsquedas ya está en el código (`src/lib/metricas.ts`) y funciona
sin infra extra. Umami es opcional pero recomendado para el tráfico.

---

## 1. Panel propio de búsquedas (ya funciona)

No requiere nada nuevo salvo, idealmente, dos variables en `.env.local`:

```
ADMIN_TOKEN=...           # ya lo usas para /admin/cargar; protege también /admin/stats
METRICAS_SALT=...         # sal para el hash de IP (openssl rand -hex 16)
```

La tabla `metricas.busquedas` se crea sola en el primer registro. Entra a:

```
https://lalupa.mx/admin/stats?token=TU_ADMIN_TOKEN
```

Verás KPIs, actividad por día, términos top, **buscado sin resultados**
(lo más útil para saber qué falta), países, referrers y las últimas búsquedas.
No se guarda la IP en claro, solo un hash truncado.

## 2. Cloudflare enfrente (recomendado, ~10 min)

Da tres cosas gratis: TLS, protección anti-bot y — clave para el registro — la
**IP real** en `CF-Connecting-IP` y el **país** en `CF-IPCountry`, que la app ya
lee. Sin Cloudflare el país queda vacío (se puede añadir GeoIP después).

1. Mete el dominio en Cloudflare y apunta los nameservers.
2. Registros DNS (proxy naranja **activado** en ambos):
   - `A  lalupa       → IP-de-tu-EC2`
   - `A  stats        → IP-de-tu-EC2`
3. SSL/TLS → modo **Full**. (Evita "Flexible": es inseguro.)

## 3. Subdominio + nginx

Reemplaza el nginx que genera `deploy/setup.sh` por el de aquí (ajusta el dominio):

```bash
sudo cp deploy/analitica/nginx-lalupa.conf /etc/nginx/conf.d/lalupa2.conf
sudo nano /etc/nginx/conf.d/lalupa2.conf     # cambia lalupa.mx por tu dominio
sudo nginx -t && sudo systemctl reload nginx
```

Si **no** usas Cloudflare, monta TLS con certbot:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d lalupa.mx -d www.lalupa.mx -d stats.lalupa.mx
```

## 4. Umami (analítica de tráfico)

Necesita Docker en la EC2 (`sudo dnf install -y docker && sudo systemctl enable --now docker`).

```bash
cd deploy/analitica
cp .env.example .env
# rellena UMAMI_DB_PASSWORD y UMAMI_APP_SECRET con: openssl rand -base64 32
sudo docker compose up -d
```

Umami queda en `127.0.0.1:3001` (nginx lo publica en `stats.lalupa.mx`).

1. Entra a `https://stats.lalupa.mx` — login inicial **admin / umami** (cámbialo ya).
2. Settings → Websites → *Add website* → dominio `lalupa.mx`.
3. Copia el **Website ID** y la URL del script.
4. Añádelos a `.env.local` de la app y reinicia (`systemctl restart lalupa2`):

```
NEXT_PUBLIC_UMAMI_SRC=https://stats.lalupa.mx/script.js
NEXT_PUBLIC_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

`layout.tsx` ya inyecta el script sólo si esas dos variables existen.

## Privacidad

Es una herramienta de transparencia; puede usarla gente buscando temas sensibles.
Por eso: Umami no usa cookies ni rastrea entre sitios, y el registro propio **no
guarda IP en claro** (solo `sha256(salt + ip)` truncado). Para minimizar aún más,
programa una purga periódica (ver comentario final en `db-migration/10_metricas.sql`).
