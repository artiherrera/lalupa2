# Esquema `investigacion`

Modelo de datos del módulo. Vive en el esquema de PostgreSQL `investigacion`, separado de las tablas de contratos. `datos` es el único agente que lo modifica; los demás lo leen.

## Idea general

Cuatro cosas: **documentos** (de dónde salen los datos), **entidades** (personas, empresas, dependencias, notarios, domicilios), **vínculos** (una entidad se relaciona con otra o con un contrato) y **evidencias** (qué fragmento de qué documento respalda cada entidad o vínculo). Todo lo demás son tablas de apoyo.

## Tablas

### `fuentes`
Cada archivo o descarga que entró al sistema.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| tipo | text | `documento`, `sat_69b`, `dof`, `declaranet`, `rupc`, ... |
| nombre_archivo | text | |
| hash_sha256 | text UNIQUE | evita duplicados |
| ruta_local | text | solo la Mac la resuelve; en AWS es informativa |
| url_origen | text NULL | |
| fecha_descarga | timestamptz | |
| paginas | int NULL | |
| creado_en | timestamptz | |

### `documentos`
Un archivo clasificado y con texto extraído.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| fuente_id | bigint FK fuentes | |
| tipo | text | lista cerrada de `etl/investigacion/tipos.py` |
| confianza_tipo | numeric(4,3) | |
| estado | text | `pendiente`, `revisar`, `en_revision`, `procesado` |
| fecha_documento | date NULL | la fecha que dice el documento, no la de carga |
| texto | text | texto extraído completo |
| modelo | text | `ollama:qwen2.5:7b` |
| version_prompt | int | |
| creado_en | timestamptz | |

### `entidades`
Una persona, empresa, dependencia, notaría o domicilio tal como aparece en una fuente. Varias filas pueden apuntar a la misma `entidad_canonica`.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| tipo | text | `persona`, `empresa`, `dependencia`, `notaria`, `domicilio` |
| nombre | text | como viene en la fuente |
| nombre_normalizado | text | función única en `etl/investigacion/normalizar.py`; indexado |
| rfc | text NULL | indexado; validado en formato |
| curp | text NULL | solo servidores públicos |
| canonica_id | bigint FK entidades NULL | a qué entidad canónica pertenece |
| fuente_id | bigint FK fuentes NOT NULL | |
| estado | text | `propuesto`, `confirmado`, `rechazado` |
| creado_por | text | `humano`, `modelo:<nombre>`, `fuente:<nombre>`, `resolucion:rfc` |
| creado_en | timestamptz | |

### `vinculos`
La relación entre dos entidades, o entre una entidad y un contrato de LaLupa.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| origen_id | bigint FK entidades | |
| destino_id | bigint FK entidades NULL | uno de los dos destinos |
| contrato_id | (tipo de la PK de contratos) FK NULL | el otro destino |
| tipo | text | ver lista abajo |
| atributos | jsonb | porcentaje de acciones, cargo, fecha de inicio, monto... |
| fuente_id | bigint FK fuentes NOT NULL | |
| estado | text | `propuesto`, `confirmado`, `rechazado` |
| puntaje | numeric(4,3) NULL | solo para vínculos generados por resolución o cruce |
| creado_por | text | |
| creado_en | timestamptz | |
| revisado_por | text NULL | |
| revisado_en | timestamptz NULL | |

Restricción: exactamente uno de `destino_id` o `contrato_id` es no nulo.

Tipos de vínculo (lista cerrada): `socio_de`, `administra`, `representa`, `apoderado_de`, `comisario_de`, `protocolizo`, `domiciliada_en`, `gano_contrato`, `otorgo_contrato`, `trabaja_en`, `declara_interes_en`, `misma_entidad_que`, `en_lista_69b`, `menciona`.

### `evidencias`
El fragmento exacto que respalda una entidad o un vínculo.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| documento_id | bigint FK documentos | |
| entidad_id | bigint FK NULL | |
| vinculo_id | bigint FK NULL | |
| pagina | int NULL | |
| fragmento | text | máximo 300 caracteres, literal |
| posicion_inicio | int NULL | offset en `documentos.texto` |
| confianza | numeric(4,3) | |

### `candidatos`
Pares que `resolucion` cree que son la misma entidad y esperan decisión.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| entidad_a | bigint FK entidades | |
| entidad_b | bigint FK entidades | |
| nivel | text | `fuerte`, `probable`, `debil` |
| puntaje | numeric(4,3) | |
| senales | jsonb | qué coincidió: nombre, domicilio, notario... |
| estado | text | `pendiente`, `aceptado`, `rechazado` |
| decidido_por | text NULL | |
| decidido_en | timestamptz NULL | |

Índice único sobre `(least(entidad_a, entidad_b), greatest(entidad_a, entidad_b))`.

### `no_coincide`
Pares que Arturo rechazó; no se vuelven a proponer.

### `alertas`
Resultados de los cruces automáticos.

| columna | tipo | nota |
|---|---|---|
| id | bigserial PK | |
| tipo_cruce | text | nombre de la consulta que la generó |
| entidad_id | bigint FK | |
| contrato_id | FK NULL | |
| detalle | jsonb | lo que el cruce encontró |
| detectada_en | timestamptz | |
| estado | text | `nueva`, `vista`, `descartada`, `convertida` |

### `corridas`
Bitácora del pipeline: qué documento, qué etapas, cuánto tardó, qué modelo, qué falló.

## Reglas de integridad

- `entidades.fuente_id` y `vinculos.fuente_id` son NOT NULL. Sin excepción.
- Nada se borra físicamente. `estado = 'rechazado'` es el borrado.
- Las uniones de entidades se hacen apuntando `canonica_id`; los registros originales se conservan.
- El esquema de contratos existente no tiene llaves foráneas hacia `investigacion`. La dirección es siempre `investigacion → contratos`.

## Conexión con LaLupa

`vinculos.contrato_id` apunta a la tabla de contratos. Para unir un proveedor de Compranet con una entidad: `resolucion` crea una entidad tipo `empresa` por cada RFC distinto de proveedor (una sola vez, en la fase 0) con `creado_por = 'fuente:compranet'`, y de ahí en adelante todo lo que llega se resuelve contra esas entidades.
