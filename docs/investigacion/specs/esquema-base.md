# Spec: esquema base `investigacion`

Versión 1 — 2026-10-18. Tarea 0.1 del roadmap. Base: `docs/investigacion/esquema.md`.

## Objetivo
Que exista en PostgreSQL el esquema `investigacion` completo, con sus reglas de integridad aplicadas por la propia base, para que las tareas 0.2 a 0.5 (y todo lo demás) escriban sobre tablas que ya no permiten vínculos sin fuente, confirmaciones sin humano ni borrados.

## Alcance
Entra:
- `db-migration/20_investigacion_esquema.sql`: crea el esquema `investigacion` con las tablas de `esquema.md` (`fuentes`, `documentos`, `entidades`, `vinculos`, `evidencias`, `candidatos`, `no_coincide`, `alertas`, `corridas`) más `contratos_ref` (ver Modelo de datos).
- `db-migration/20_investigacion_esquema_down.sql`: la reversa.
- Prueba automatizada que aplica, siembra, verifica restricciones y revierte, contra PostgreSQL 17 local en Docker.
- Actualizar `docs/investigacion/esquema.md` para que refleje exactamente lo creado (lo hace `datos`, que es su dueño).

Queda fuera:
- Aplicar la migración en AWS. Se hace después, con aprobación de Arturo (ver Dependencias).
- Cargar datos: entidades de Compranet (0.2), lista 69-B (0.4).
- Función de normalización (0.3). Aquí `nombre_normalizado` es solo una columna `text`; no se crea función SQL de normalización.
- Extensiones (`pg_trgm`, etc.). Si resolución las necesita, van en su propia migración `2x_` con su spec.
- Índices de texto completo sobre `documentos.texto`.
- Tabla de bitácora de cambios de estado (historial de quién deshizo qué). Se especifica con la tarea 3.4.
- Consultas en `src/lib/investigacion/` y pantallas.

## Lo que hay hoy en contratos (verificado, no supuesto)

Fuentes revisadas: `src/lib/contratos.ts`, `src/lib/etl.ts`, `etl/load_contratos.py`, `db-migration/*.sql` y el esquema Drizzle de solo lectura en `~/Proyectos/dev/lalupa 2/src/db/schema.ts`, que refleja la tabla real de RDS.

- Tabla: `contratos.contratos`. Las fechas son `timestamp` sin zona, `importe` es `double precision`, `rfc` es `varchar(20)` y `anio_fuente` es `varchar(10)`. `search_vector` es una columna generada y `created_at` es `timestamp default now()`.
- **No hay columna `id` ni llave primaria de una sola columna.** Ningún archivo del repo la menciona y el esquema reflejado no la tiene.
- La identidad de un contrato es el índice único `idx_contrato_compuesto (codigo_contrato, titulo_contrato, proveedor_contratista)`, las tres de tipo `text` y que aceptan NULL. Es la llave del `ON CONFLICT` en ambos ETL, y el upsert nunca reescribe esas tres columnas.
- Otros índices conocidos: `idx_contratos_rfc` (btree) e `idx_contratos_created_at`.
- PostgreSQL 17 en RDS (`db-migration/SETUP-AWS.md`).

Consecuencia: `vinculos.contrato_id` no puede ser una llave foránea simple hacia `contratos.contratos`. Se resuelve con `contratos_ref` (decisión registrada en `decisiones.md`).

## Modelo de datos

Convenciones para todas las tablas:
- PK: `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (mismo patrón que `10_metricas.sql`; equivale al `bigserial` de `esquema.md`).
- `creado_en timestamptz NOT NULL DEFAULT now()` donde aparezca.
- Puntajes y confianzas: `numeric(4,3)` con `CHECK (x BETWEEN 0 AND 1)`.
- Listas cerradas: `CHECK (col IN (...))`. Excepción: `documentos.tipo` y `fuentes.tipo` no llevan CHECK, porque su lista crece con cada fase y se valida en Python (`etl/investigacion/tipos.py`).
- Todas las FK son `ON DELETE NO ACTION`. Nada se borra.

### Tabla nueva respecto a `esquema.md`: `contratos_ref`
Puente entre el módulo y un contrato de LaLupa. Se crea una fila solo cuando algo del módulo apunta a un contrato, no se precarga.

| columna | tipo | nota |
|---|---|---|
| id | bigint identity PK | es lo que guardan `vinculos.contrato_id` y `alertas.contrato_id` |
| codigo_contrato | text NOT NULL | |
| titulo_contrato | text NOT NULL | |
| proveedor_contratista | text NOT NULL | |
| creado_en | timestamptz NOT NULL default now() | |

- `UNIQUE (codigo_contrato, titulo_contrato, proveedor_contratista)`.
- `FOREIGN KEY (codigo_contrato, titulo_contrato, proveedor_contratista) REFERENCES contratos.contratos (codigo_contrato, titulo_contrato, proveedor_contratista)`. Apunta al índice único existente y no altera la tabla de contratos.
- Las tres columnas son NOT NULL porque un índice único con NULL no garantiza unicidad. Un contrato con alguna de las tres en NULL no se puede vincular. Esa limitación se acepta.

### Cambios respecto a `esquema.md`
1. `vinculos.contrato_id` y `alertas.contrato_id`: `bigint NULL REFERENCES investigacion.contratos_ref(id)`.
2. `entidades` gana `revisado_por text NULL` y `revisado_en timestamptz NULL`, como `vinculos`. Sin ellas no queda registro de quién confirmó una entidad.
3. Se definen las columnas de `no_coincide` y `corridas`, que `esquema.md` dejó sin detallar (abajo).
4. `en_lista_69b` sale de la lista de tipos de vínculo. Estar en la 69-B es un dato oficial sobre un RFC, no una relación entre dos entidades; vive en su propia tabla, que crea la tarea 0.4 (ver `decisiones.md`).

### Restricciones por tabla (además de las columnas de `esquema.md`)

**fuentes**
- `tipo text NOT NULL`, `nombre_archivo text NOT NULL`, `ruta_local text NULL`, `fecha_descarga timestamptz NOT NULL DEFAULT now()`.
- `hash_sha256 text NOT NULL UNIQUE CHECK (hash_sha256 ~ '^[0-9a-f]{64}$')`.
- `paginas int NULL CHECK (paginas > 0)`.

**documentos**
- `fuente_id bigint NOT NULL UNIQUE REFERENCES fuentes`. Un archivo es un documento.
- `tipo text NOT NULL`, `estado text NOT NULL CHECK (estado IN ('pendiente','revisar','en_revision','procesado'))`, sin default.
- `texto text NOT NULL` (puede ser `''` si el OCR no sacó nada). `confianza_tipo`, `modelo` y `version_prompt` aceptan NULL.
- Índice en `estado`.

**entidades**
- `tipo text NOT NULL CHECK (tipo IN ('persona','empresa','dependencia','notaria','domicilio'))`.
- `nombre text NOT NULL`, `nombre_normalizado text NOT NULL`.
- `rfc text NULL CHECK (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' AND rfc NOT IN ('XAXX010101000','XEXX010101000'))`. Los RFC genéricos no se guardan; el importador los convierte en NULL.
- `curp text NULL CHECK (curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$')`.
- `canonica_id bigint NULL REFERENCES entidades(id) CHECK (canonica_id <> id)`. NULL significa «es su propia canónica».
- `fuente_id bigint NOT NULL REFERENCES fuentes`.
- `estado text NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto','confirmado','rechazado'))`.
- `creado_por text NOT NULL CHECK (creado_por ~ '^(humano|(modelo|fuente|resolucion|cruce):.+)$')`.
- Regla de confirmación (CHECK): `estado = 'propuesto' OR (revisado_por IS NOT NULL AND revisado_en IS NOT NULL) OR creado_por = 'resolucion:rfc'`.
- `UNIQUE (fuente_id, rfc)`. Postgres ignora los NULL en un UNIQUE, así que solo restringe filas con RFC: un mismo RFC no se repite dentro de una fuente.
- Índices en `nombre_normalizado`, `rfc`, `canonica_id`, `fuente_id` y `estado`.

**vinculos**
- `origen_id bigint NOT NULL REFERENCES entidades`, `destino_id bigint NULL REFERENCES entidades`, `contrato_id bigint NULL REFERENCES contratos_ref`.
- `CHECK (num_nonnulls(destino_id, contrato_id) = 1)`, `CHECK (destino_id IS NULL OR destino_id <> origen_id)`.
- `tipo text NOT NULL CHECK (tipo IN ('socio_de','administra','representa','apoderado_de','comisario_de','protocolizo','domiciliada_en','gano_contrato','otorgo_contrato','trabaja_en','declara_interes_en','misma_entidad_que','menciona'))`.
- `atributos jsonb NOT NULL DEFAULT '{}'`. Los montos dentro de `atributos` van en centavos y con sufijo `_centavos`. Esto es una convención, no un CHECK.
- `fuente_id bigint NOT NULL REFERENCES fuentes`.
- `estado`, `creado_por` y la regla de confirmación son iguales que en `entidades`.
- `UNIQUE NULLS NOT DISTINCT (origen_id, destino_id, contrato_id, tipo, fuente_id)`. La misma relación de la misma fuente no se repite. Requiere PostgreSQL 15 o más.
- Índices en `origen_id`, `destino_id`, `contrato_id`, `fuente_id`, `tipo` y `estado`.

**evidencias**
- `documento_id bigint NOT NULL REFERENCES documentos`, `entidad_id bigint NULL REFERENCES entidades`, `vinculo_id bigint NULL REFERENCES vinculos`.
- `CHECK (num_nonnulls(entidad_id, vinculo_id) = 1)`. Una evidencia respalda exactamente una cosa.
- `fragmento text NOT NULL CHECK (char_length(fragmento) BETWEEN 1 AND 300)`.
- `pagina int NULL CHECK (pagina >= 1)`, `posicion_inicio int NULL CHECK (posicion_inicio >= 0)`, `confianza` con CHECK 0–1 y NOT NULL.
- `creado_en timestamptz NOT NULL DEFAULT now()`.
- Índices en `documento_id`, `entidad_id` y `vinculo_id`.

**candidatos**
- `entidad_a` y `entidad_b` son `bigint NOT NULL REFERENCES entidades`, con `CHECK (entidad_a <> entidad_b)`.
- `nivel text NOT NULL CHECK (nivel IN ('fuerte','probable','debil'))`, `puntaje NOT NULL`, `senales jsonb NOT NULL DEFAULT '{}'`.
- `estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptado','rechazado'))`.
- CHECK: `estado = 'pendiente' OR (decidido_por IS NOT NULL AND decidido_en IS NOT NULL)`.
- `creado_en timestamptz NOT NULL DEFAULT now()`.
- Índice único sobre `(least(entidad_a, entidad_b), greatest(entidad_a, entidad_b))` e índice en `estado`.

**no_coincide**

| columna | tipo | nota |
|---|---|---|
| id | bigint identity PK | |
| entidad_a | bigint NOT NULL FK entidades | |
| entidad_b | bigint NOT NULL FK entidades | `CHECK (entidad_a <> entidad_b)` |
| candidato_id | bigint NULL FK candidatos | de qué candidato salió el rechazo, si salió de uno |
| decidido_por | text NOT NULL | |
| decidido_en | timestamptz NOT NULL DEFAULT now() | |
| motivo | text NULL | |

Índice único sobre `(least(entidad_a, entidad_b), greatest(entidad_a, entidad_b))`.

**alertas**
- `tipo_cruce text NOT NULL`, `entidad_id bigint NOT NULL REFERENCES entidades`, `contrato_id bigint NULL REFERENCES contratos_ref`.
- `detalle jsonb NOT NULL DEFAULT '{}'`, `detectada_en timestamptz NOT NULL DEFAULT now()`.
- `estado text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','vista','descartada','convertida'))`.
- Índices en `estado`, `entidad_id`, `contrato_id` y `tipo_cruce`.

**corridas**

| columna | tipo | nota |
|---|---|---|
| id | bigint identity PK | |
| proceso | text NOT NULL | `CHECK IN ('ingesta','importador','resolucion','cruce')` |
| fuente_id | bigint NULL FK fuentes | |
| documento_id | bigint NULL FK documentos | |
| modelo | text NULL | |
| version_prompt | int NULL | |
| estado | text NOT NULL DEFAULT 'en_curso' | `CHECK IN ('en_curso','ok','error')` |
| etapas | jsonb NOT NULL DEFAULT '[]' | `[{etapa, inicio, fin, ms, ok, error}]` |
| detalle | jsonb NOT NULL DEFAULT '{}' | texto parcial, datos descartados, motivo de `revisar` |
| error | text NULL | |
| iniciada_en | timestamptz NOT NULL DEFAULT now() | |
| terminada_en | timestamptz NULL | |

CHECK: `estado = 'en_curso' OR terminada_en IS NOT NULL`. Índices en `documento_id` y `iniciada_en DESC`.

### Guarda contra borrados
Una función `investigacion.prohibir_borrado()` lanza una excepción con el mensaje «En investigacion nada se borra: cambia estado». La disparan dos triggers en **todas** las tablas del esquema:
- `BEFORE DELETE ... FOR EACH ROW`
- `BEFORE TRUNCATE ... FOR EACH STATEMENT`

`DROP SCHEMA` no dispara triggers, así que la reversa funciona.

## Flujo

`20_investigacion_esquema.sql`, en este orden y en una sola transacción:
1. `BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s';`. Si el ETL está cargando, la migración falla rápido en vez de quedarse en cola.
2. Verificación previa en un bloque `DO`. Si algo no se cumple, `RAISE EXCEPTION` con un mensaje en español y no se crea nada:
   - `server_version_num >= 150000`.
   - Existe `contratos.contratos`.
   - Existe un índice **único, no parcial y sin expresiones** sobre exactamente las columnas `{codigo_contrato, titulo_contrato, proveedor_contratista}` de `contratos.contratos`. No se exige el nombre `idx_contrato_compuesto`, solo las columnas.
   - No existe ya el esquema `investigacion`.
3. `CREATE SCHEMA investigacion;`.
4. Tablas en orden de dependencias: `fuentes`, `documentos`, `entidades`, `contratos_ref`, `vinculos`, `evidencias`, `candidatos`, `no_coincide`, `alertas`, `corridas`.
5. Índices.
6. Función `prohibir_borrado` y sus triggers.
7. `COMMENT ON` en el esquema y en cada tabla, con una línea en español que diga qué guarda.
8. `COMMIT;`.

`20_investigacion_esquema_down.sql`:
1. `BEGIN; SET LOCAL lock_timeout = '5s';`.
2. Un bloque `DO` que revisa si alguna tabla de `investigacion` tiene filas. Si las tiene y `current_setting('investigacion.forzar_down', true)` no es `'si'`, lanza `RAISE EXCEPTION 'investigacion tiene datos: respalda y corre con PGOPTIONS="-c investigacion.forzar_down=si"'`.
3. `DROP SCHEMA investigacion CASCADE;`. Esto también quita la FK hacia `contratos.contratos` y sus triggers internos.
4. `COMMIT;`.

Cómo se aplica (igual que `10_` y `11_`):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db-migration/20_investigacion_esquema.sql
```

SQL de referencia para la parte delicada (ilustrativo, no definitivo):

```sql
CREATE TABLE investigacion.contratos_ref (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_contrato       text NOT NULL,
  titulo_contrato       text NOT NULL,
  proveedor_contratista text NOT NULL,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo_contrato, titulo_contrato, proveedor_contratista),
  FOREIGN KEY (codigo_contrato, titulo_contrato, proveedor_contratista)
    REFERENCES contratos.contratos (codigo_contrato, titulo_contrato, proveedor_contratista)
);

-- vínculo con un contrato: así se resuelve contrato_id
INSERT INTO investigacion.contratos_ref (codigo_contrato, titulo_contrato, proveedor_contratista)
VALUES ($1, $2, $3)
ON CONFLICT (codigo_contrato, titulo_contrato, proveedor_contratista) DO NOTHING;
-- y luego SELECT id ... con las mismas tres columnas.
```

## Interfaz
No aplica.

## Reglas
- **No se toca `contratos.contratos`**: ni `ALTER`, ni índices nuevos, ni `GRANT`. La única relación es la FK de `contratos_ref`. Efectos que se aceptan:
  - Postgres agrega a `contratos.contratos` triggers internos de integridad. Cuando el upsert no cambia las tres columnas de la llave, como hoy, no se disparan.
  - Un `DELETE` de un contrato referenciado falla.
  - `TRUNCATE contratos.contratos` falla mientras exista la FK. Ningún ETL actual hace `TRUNCATE` ni `DELETE`.
- No se crea ninguna función de normalización en SQL. La única normalización vive en `etl/investigacion/normalizar.py` (0.3).
- La migración no hace `GRANT`. Se corre con el mismo rol con el que se conecta la app, que es el dueño de todo, igual que `10_metricas.sql`.
- Nombres de tablas, columnas, constraints e índices en español sin acentos. Los constraints llevan nombre explícito (`vinculos_un_destino`, `entidades_confirmacion_humana`, etc.) para que los errores se entiendan.
- Las pruebas corren contra PostgreSQL 17 local en Docker, **nunca contra AWS**.

  Para que la migración corra en local, la prueba crea un sustituto mínimo de `contratos.contratos` con:
  - `codigo_contrato`, `titulo_contrato` y `proveedor_contratista` de tipo `text` y que aceptan NULL;
  - `rfc varchar(20)`;
  - `importe double precision`;
  - el índice único `idx_contrato_compuesto` sobre las tres columnas.

  El sustituto es solo para pruebas y no se versiona como migración.
- Contenedor de pruebas: `docker run -d --name lalupa-pg-test -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17`. La prueba lee `INVESTIGACION_TEST_DATABASE_URL`. Si no está definida, **falla** con un mensaje que dice cómo levantar el contenedor; no se salta.
- Las migraciones se aplican con `psql` desde la prueba (`subprocess`), igual que en producción.
- `pytest` y `psycopg2-binary` (si no está ya) se agregan a `etl/requirements.txt`.

## Criterios de aceptación
Prueba en `etl/investigacion/tests/test_migracion_20.py`, contra Postgres 17 en Docker:

1. Con el sustituto de `contratos.contratos` creado, `20_investigacion_esquema.sql` se aplica sin errores y crea las 10 tablas.
2. Aplicarla dos veces seguidas: la segunda falla en la verificación previa y no cambia nada.
3. Sin el índice único compuesto en `contratos.contratos`, la migración falla con el mensaje de la verificación y no existe el esquema `investigacion`.
4. Insertar en `entidades` y en `vinculos` sin `fuente_id` falla.
5. Un vínculo con `destino_id` y `contrato_id` a la vez falla, y uno sin ninguno de los dos también.
6. Un vínculo `confirmado` con `creado_por = 'modelo:x'` y sin `revisado_por` falla. El mismo con `revisado_por` y `revisado_en` pasa. Uno `confirmado` con `creado_por = 'resolucion:rfc'` pasa.
7. Lo mismo que el punto 6 para `entidades`.
8. `entidades.rfc`: `'XAXX010101000'`, `'abc123'` y un RFC en minúsculas fallan; `'ABC010101AB1'` (12) y `'ABCD010101AB1'` (13) pasan.
9. Un `DELETE` sobre cualquiera de las 10 tablas falla con el mensaje de `prohibir_borrado`, y un `TRUNCATE` también.
10. `contratos_ref` acepta las tres columnas de un contrato que existe en el sustituto. Con un contrato que no existe, falla por la FK. Insertar el mismo contrato dos veces con `ON CONFLICT DO NOTHING` deja una sola fila.
11. Un `DELETE` en el sustituto de `contratos.contratos` sobre un contrato referenciado falla. Sobre uno no referenciado, pasa.
12. Insertar dos `candidatos` con el mismo par en orden inverso (`a,b` y `b,a`) falla.
13. Una `evidencia` con fragmento de 301 caracteres falla, y una con `entidad_id` y `vinculo_id` a la vez también.
14. Dos vínculos idénticos de la misma fuente, con `contrato_id` NULL, fallan por `UNIQUE NULLS NOT DISTINCT`.
15. Con datos sembrados, `20_investigacion_esquema_down.sql` sin `forzar_down` falla y el esquema sigue ahí. Con `PGOPTIONS="-c investigacion.forzar_down=si"` revierte. Después:
    - no existe el esquema `investigacion`;
    - el sustituto de `contratos.contratos` sigue intacto (mismas filas e índices);
    - ya no tiene triggers internos de FK.
16. Después de la reversa, `20_investigacion_esquema.sql` se puede volver a aplicar limpio.
17. Además de la prueba: `docs/investigacion/esquema.md` queda actualizado con `contratos_ref`, las columnas nuevas de `entidades`, `no_coincide` y `corridas`, sin `en_lista_69b` en los tipos de vínculo, y coincide con lo que crea el SQL.
18. Además de la prueba: el SQL de `20_` no contiene `ALTER`, `CREATE INDEX` ni `GRANT` sobre `contratos.`. Se verifica con grep.

## Agente responsable
`datos`.

## Dependencias
- Ninguna tarea previa del roadmap.
- Docker con `postgres:17` en la Mac. Docker y `psql` 17 ya están instalados.
- **Para aplicar en AWS, que no es parte de esta tarea:**
  - La Mac llega al RDS por un túnel de SSM a través de la EC2 de la app (ver `decisiones.md`). Hoy el RDS no responde directo desde la Mac: la conexión se corta por timeout en el puerto 5432.
  - Antes de aplicar, `datos` corre en producción `\d contratos.contratos` y `\di contratos.*`, solo lectura, y confirma lo de la sección «Lo que hay hoy en contratos». Si aparece una llave primaria de una sola columna, se aplica igual: `contratos_ref` se queda como está (ver decisión).
  - También se registra cuántos contratos tienen alguna de las tres columnas de la llave en NULL, porque no se van a poder vincular.
  - Se aplica fuera de una carga del ETL. Si coincide con una, el `lock_timeout` de 5 s hace que falle sin bloquear nada; se vuelve a correr.
