# Guía desde cero — Crear infra en AWS y migrar desde Digital Ocean

Esta guía te lleva de **no tener nada** a tener la base migrada en **Amazon RDS for PostgreSQL**.
Se hace todo por la **consola web de AWS** (lo más simple para la primera vez). Al final hay un apéndice con la alternativa por CLI.

Arquitectura objetivo:

```
   Digital Ocean (origen)                AWS — Región X
   ┌──────────────────────┐             ┌───────────────────────────────────┐
   │ Managed PostgreSQL    │   internet  │  VPC por defecto                  │
   │ puerto 25060, SSL     │◀───────────│  ┌────────────┐   privado  ┌─────┐│
   └──────────────────────┘   (dump)    │  │ EC2 runner │──5432────▶│ RDS ││
       ▲ Trusted Sources                │  │ (pg_dump/  │           │ PG  ││
       └── IP pública del EC2            │  │  restore)  │           └─────┘│
                                         │  └────────────┘                  │
                                         └───────────────────────────────────┘
```

El **EC2 runner** descarga el dump desde DO y lo restaura en el RDS por red privada. Lo necesitamos porque tu base es de 50–500 GB (no cabe en tu Mac y la red sería lenta). Al terminar, **se apaga/elimina**.

---

## FASE 0 — Prerrequisitos y decisiones (10 min)

### 0.1 — Averigua la versión de Postgres de Digital Ocean
La versión del RDS debe ser **igual o mayor**. Desde tu Mac (solo lee metadatos):

```bash
psql "postgresql://doadmin:PASSWORD@db-postgresql-xxx.b.db.ondigitalocean.com:25060/defaultdb?sslmode=require" \
  -c "show server_version;"
```
> La cadena exacta está en DO → Databases → tu clúster → **Connection Details**.
> Si tu IP no está autorizada, agrégala primero en *Settings → Trusted Sources*.

Anota el número mayor (p. ej. `15`, `16`). Lo usarás en la Fase 1.

### 0.2 — Crea una cuenta de AWS (si no tienes)
1. Ve a https://aws.amazon.com → **Create an AWS Account**.
2. Necesitas email, tarjeta y un teléfono para verificar.
3. Entra a la consola como usuario root **solo para el setup inicial**.

> Buena práctica: luego crea un usuario IAM para el día a día en vez de usar root. Para esta migración puntual, root o un IAM admin sirve.

### 0.3 — Elige una **Región** y no la cambies
Arriba a la derecha en la consola hay un selector de región. Elige **una cercana a tus usuarios** y úsala para TODO (RDS y EC2 deben estar en la misma región). Ejemplos: `us-east-1` (Virginia), `us-west-2` (Oregon), `mx-central-1` (México). En esta guía la llamo **`<REGION>`**.

---

## FASE 1 — Crear el RDS PostgreSQL (15 min + ~10 min de aprovisionamiento)

Consola → busca **RDS** → **Databases** → **Create database**.

| Sección | Qué elegir |
|---|---|
| **Choose a database creation method** | *Standard create* |
| **Engine type** | *PostgreSQL* |
| **Engine version** | **≥ la versión de DO** (paso 0.1). Tu origen es **17** → elige **PostgreSQL 17**. |
| **Templates** | *Production* (o *Dev/Test* si es para probar) |
| **Availability** | *Single DB instance* para empezar (puedes pasar a Multi-AZ después) |
| **DB instance identifier** | `lalupa2-pg` |
| **Master username** | `lalupa2admin` (NO es superusuario; es `rds_superuser`) |
| **Master password** | genera una fuerte y **guárdala** |
| **DB instance class** | ver tabla de sizing abajo |
| **Storage type** | *gp3* |
| **Allocated storage** | ~1.5× tu tamaño de datos (ver tabla) |
| **Enable storage autoscaling** | ✅ Sí, con un máximo holgado |
| **Connectivity → Public access** | **No** (el EC2 entra por red privada) |
| **VPC** | *Default VPC* |
| **VPC security group** | *Create new* → nómbralo `rds-lalupa2-sg` |
| **Database authentication** | *Password authentication* |
| **Additional configuration → Initial database name** | `lalupa2` (¡importante! si lo dejas vacío, no crea base y tendrás que crearla a mano) |
| **Backup** | deja backups automáticos activados |

Pulsa **Create database**. Tarda ~10 min en quedar *Available*. Copia el **Endpoint** (algo como `lalupa2-pg.xxxx.<REGION>.rds.amazonaws.com`).

### Tabla de sizing orientativa
| Tamaño de datos | DB instance class (RDS) | Storage gp3 RDS | EC2 runner | EBS del runner |
|---|---|---|---|---|
| ~50 GB | db.t3.large | 100 GB | t3.large | 60 GB |
| ~150 GB | db.m6g.large | 250 GB | m6i.large | 120 GB |
| ~500 GB | db.m6g.xlarge | 800 GB | m6i.xlarge | 400 GB |

> Puedes empezar con una clase modesta para la migración y subir/bajar después. Para acelerar el restore ayuda más CPU y más IOPS en gp3.

---

## FASE 2 — Crear el EC2 runner (10 min)

Consola → **EC2** → **Launch instance**.

| Campo | Valor |
|---|---|
| **Name** | `lalupa2-migrator` |
| **AMI** | *Ubuntu Server 24.04 LTS* (x86_64) |
| **Instance type** | según la tabla de sizing (p. ej. `m6i.large`) |
| **Key pair** | *Create new key pair* → descarga el `.pem` (para SSH) |
| **Network settings → VPC** | la **misma Default VPC** del RDS |
| **Auto-assign public IP** | *Enable* |
| **Firewall (security group)** | *Create* → `ec2-lalupa2-sg`; permite **SSH (22)** solo desde **My IP** |
| **Configure storage** | volumen raíz pequeño + **añade un volumen EBS gp3** del tamaño de la tabla, o agranda el raíz |

Pulsa **Launch instance**. Copia la **IP pública** del EC2 cuando esté *Running*.

---

## FASE 3 — Conectar la red (10 min)

### 3.1 — Permitir que el EC2 hable con el RDS (privado)
Consola → **RDS** → tu instancia → pestaña *Connectivity & security* → clic en el **VPC security group** (`rds-lalupa2-sg`) → **Inbound rules** → *Edit* → **Add rule**:
- Type: **PostgreSQL** (puerto 5432)
- Source: **Custom** → empieza a escribir `ec2-lalupa2-sg` y selecciónalo (referencia al SG del EC2).
- Guarda.

### 3.2 — Autorizar la IP del EC2 en Digital Ocean
DO → Databases → tu clúster → *Settings* → **Trusted Sources** → **Add trusted source** → pega la **IP pública del EC2**.

> El egreso del EC2 hacia internet (para llegar a DO:25060) ya está abierto por defecto en el SG de salida.

### 3.3 — (Opcional) Crear la base destino si la dejaste vacía
Si NO pusiste *Initial database name* en la Fase 1, créala luego desde el EC2 (Fase 4):
```bash
psql "postgresql://lalupa2admin:PASSWORD@<RDS_ENDPOINT>:5432/postgres?sslmode=require" -c "CREATE DATABASE lalupa2;"
```

---

## FASE 4 — Preparar el runner (10 min)

### 4.1 — Conéctate por SSH
```bash
chmod 400 ~/Descargas/lalupa2-migrator.pem   # tu .pem
ssh -i ~/Descargas/lalupa2-migrator.pem ubuntu@<EC2_PUBLIC_IP>
```

### 4.2 — Instala el cliente de PostgreSQL (versión ≥ la mayor entre DO y RDS)
```bash
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
sudo apt update
sudo apt install -y postgresql-client-17 git    # tu versión objetivo es 17
pg_dump --version                                # verifica
```

### 4.3 — (Si añadiste un volumen EBS aparte) móntalo
```bash
lsblk                                            # identifica el disco nuevo, p. ej. /dev/nvme1n1
sudo mkfs -t ext4 /dev/nvme1n1
sudo mkdir -p /data && sudo mount /dev/nvme1n1 /data
sudo chown ubuntu:ubuntu /data
df -h /data
```

### 4.4 — Copia el toolkit de migración al runner
Desde tu **Mac**, sube la carpeta:
```bash
scp -i ~/Descargas/lalupa2-migrator.pem -r \
  /Users/arturoherrera/Documents/02_Proyectos/dev/lalupa2/db-migration \
  ubuntu@<EC2_PUBLIC_IP>:~/
```

---

## FASE 5 — Ejecutar la migración

En el **EC2**, dentro de `~/db-migration`:

```bash
cd ~/db-migration
cp .env.example .env
nano .env          # rellena SOURCE_URL, TARGET_URL, DUMP_DIR=/data/dump, JOBS=<vCPUs>
chmod +x *.sh

./00_preflight.sh  # chequeos: NO modifica nada
```
Resuelve cualquier ✗ que reporte el preflight. Cuando dé **PREFLIGHT OK**:

```bash
# === INICIO DE LA VENTANA DE MANTENIMIENTO ===
# Detén la app que escribe en el origen (o ponla en solo-lectura) para que
# origen y destino queden idénticos.

./01_dump.sh       # volcado del origen → /data/dump (solo lectura sobre DO)
./02_restore.sh    # restauración en el RDS (revisa restore_errors.log)
./03_verify.sh     # compara conteos fila a fila y secuencias
```

> Tip: corre el dump/restore dentro de `tmux` o `screen` para que no se corten si se cae el SSH:
> `tmux new -s mig` … (Ctrl-b d para soltar, `tmux attach -t mig` para volver).

---

## FASE 6 — Cutover y limpieza

Cuando `03_verify.sh` dé **VERIFICACIÓN OK**:
1. Crea/otorga permisos al rol de la app en el RDS (si la app usa un usuario propio).
2. Cambia la cadena de conexión de la aplicación al **endpoint del RDS**.
3. Prueba la app en lectura y escritura.
4. Reanuda el tráfico. **Fin de la ventana de mantenimiento.**

Limpieza y seguridad:
- **Apaga o termina el EC2** (`lalupa2-migrator`) para no pagar de más.
- Quita la IP del EC2 de los *Trusted Sources* de DO.
- **No borres Digital Ocean** hasta validar el RDS en producción unos días (es tu rollback: si algo falla, vuelves a apuntar la app a DO).

---

## Apéndice — Alternativa por AWS CLI (opcional, avanzado)

Si prefieres reproducirlo con comandos en vez de la consola. Requiere `aws configure` con tus credenciales y elegir `<REGION>`.

```bash
# --- RDS ---
aws rds create-db-instance \
  --db-instance-identifier lalupa2-pg \
  --engine postgres --engine-version 17 \
  --db-instance-class db.m6g.large \
  --allocated-storage 250 --storage-type gp3 --max-allocated-storage 1000 \
  --master-username lalupa2admin --master-user-password 'PON_UNA_FUERTE' \
  --db-name lalupa2 \
  --no-publicly-accessible \
  --backup-retention-period 7

# --- EC2 (usa una AMI Ubuntu de tu región y un key pair existente) ---
aws ec2 run-instances \
  --image-id ami-XXXXXXXX --instance-type m6i.large \
  --key-name lalupa2-migrator \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":200,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=lalupa2-migrator}]'
```
Las reglas de Security Group y los Trusted Sources de DO se configuran igual que en las Fases 3.
```
```

---

## Costos (orientativo, se paga por hora)
- RDS `db.m6g.large` + storage: corre 24/7 → es tu base productiva.
- EC2 runner: **solo durante la migración**; termínalo al acabar.
- Transferencia de datos saliente de DO: revisa tu plan; el dump cruza internet una vez.
