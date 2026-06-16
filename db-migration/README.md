# Migración Postgres — Digital Ocean → AWS RDS

Toolkit para migrar una base PostgreSQL gestionada de **Digital Ocean** a **Amazon RDS for PostgreSQL** mediante `pg_dump` (formato directorio, paralelo) + `pg_restore`.

| Parámetro | Valor de este proyecto |
|---|---|
| Origen | Digital Ocean Managed PostgreSQL |
| Destino | Amazon RDS for PostgreSQL |
| Estrategia | Volcado/restauración con ventana de mantenimiento |
| Tamaño | 50–500 GB |
| Downtime | Aceptable (la app se detiene durante el corte) |

Como es una migración **homogénea** (Postgres→Postgres) y se acepta una ventana de mantenimiento, **no hace falta AWS DMS ni replicación lógica**.

---

## ⚠️ Antes de empezar: dónde ejecutar esto

**No lo corras desde tu Mac.** Con 50–500 GB necesitas (a) espacio en disco para el dump y (b) red rápida hacia ambos extremos. Lo correcto:

1. Levanta una **EC2 en la misma región que el RDS** (ej. `m6i.large` o superior).
2. Adjúntale un **volumen EBS** con holgura (gp3, ≥ 60% del tamaño lógico de tu base; para 500 GB → ~300 GB+).
3. Instala el **cliente de Postgres con versión ≥ la mayor entre origen y destino** (el preflight lo valida):
   ```bash
   # Ubuntu/Debian — repo oficial PGDG
   sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
   curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
   sudo apt update && sudo apt install -y postgresql-client-16   # ajusta la versión
   ```
4. Copia esta carpeta `db-migration/` al EC2 y sigue los pasos de abajo.

> El **preflight** (paso 0) sí puedes correrlo desde tu Mac: solo lee metadatos y verifica conectividad/versiones/extensiones, no descarga datos.

---

## Red y accesos

- **Digital Ocean (origen):** añade la IP pública del runner (EC2 o tu Mac) a *Databases → tu clúster → Settings → Trusted Sources*. La conexión usa `sslmode=require` (puerto típico `25060`).
- **RDS (destino):** el *Security Group* debe permitir el puerto `5432` desde el runner. Si el runner está en la misma VPC, usa el endpoint privado (ideal). Si no, haz el RDS *publicly accessible* temporalmente y **vuelve a cerrarlo** al terminar.
- Crea de antemano la **base de datos destino** en el RDS si no existe (el restore no usa `--create`):
  ```sql
  CREATE DATABASE midb;
  ```

---

## Pasos

```bash
cp .env.example .env       # 1) rellena SOURCE_URL, TARGET_URL, DUMP_DIR, JOBS
chmod +x *.sh

./00_preflight.sh          # 2) chequeos (no cambia nada)
# --- INICIO DE LA VENTANA DE MANTENIMIENTO: detén la app que escribe en el origen ---
./01_dump.sh               # 3) volcado del origen (solo lectura)
./02_restore.sh            # 4) restauración en el RDS (escribe en destino)
./03_verify.sh             # 5) verifica conteos fila a fila
# --- Apunta la app al RDS y reanuda. FIN DE LA VENTANA ---
```

`JOBS` ≈ nº de vCPUs del runner (sin exceder el límite de conexiones del clúster origen/destino).

### Detener escrituras durante el corte
Para que origen y destino queden idénticos, **nadie debe escribir en el origen entre el dump y el cutover**. Detén la aplicación o pon la base en solo-lectura antes de `01_dump.sh`.

---

## Particularidades de RDS (importante)

- **No hay superusuario.** El usuario master es `rds_superuser`. Por eso volcamos con `--no-owner --no-privileges`: los objetos quedan a nombre del master y luego concedes permisos a tu rol de app.
- **Extensiones.** RDS solo permite un conjunto soportado. El preflight compara las del origen contra `pg_available_extensions` del destino. Extensiones con bibliotecas precargadas (p. ej. `pg_stat_statements`) hay que añadirlas a `shared_preload_libraries` en el **Parameter Group** y **reiniciar** el RDS *antes* del restore.
- **Roles.** Con `--no-owner` el restore no necesita los roles del origen. Si tu app se conecta con roles concretos, recréalos en RDS y otórgales permisos tras el restore.
- **Errores benignos en el restore.** Es normal ver errores tipo *"must be owner of extension"* o GRANT a roles inexistentes; quedan en `restore_errors.log`. Los **graves** son fallos creando tablas, copiando datos o creando índices.

### Acelerar el restore de bases grandes (opcional)
En el **Parameter Group** del RDS, sube temporalmente y reinicia:
- `maintenance_work_mem` (p. ej. `2GB`) → índices más rápidos.
- `max_wal_size` alto y `wal_buffers` generoso → menos presión de WAL durante la carga.

Revierte estos valores tras la migración.

---

## Verificación y cutover

`03_verify.sh` compara el `count(*)` exacto de cada tabla (origen vs destino) y el `last_value` de las secuencias, y falla si hay diferencias. Para un chequeo rápido aproximado: `FAST=1 ./03_verify.sh`.

Checklist de cutover una vez `03_verify.sh` da OK:
1. Crear/otorgar permisos al rol de la aplicación en el RDS.
2. Cambiar la cadena de conexión de la app al endpoint del RDS.
3. Probar la app en lectura/escritura.
4. Cerrar el acceso público del RDS si lo abriste.
5. **Rollback:** si algo falla, vuelve a apuntar la app a Digital Ocean (no lo borres hasta validar el RDS en producción unos días).

---

## Archivos

| Archivo | Qué hace |
|---|---|
| `.env.example` | Plantilla de configuración (cópiala a `.env`). |
| `lib.sh` | Helpers compartidos (carga `.env`, logging, psql). |
| `00_preflight.sh` | Chequeos previos. No modifica nada. |
| `01_dump.sh` | `pg_dump` del origen (solo lectura). |
| `02_restore.sh` | `pg_restore` en el RDS (escribe). |
| `03_verify.sh` | Compara conteos y secuencias. |
