# Decisiones

Registro de decisiones técnicas con su motivo. Una por entrada, fechada. Cuando una decisión cambia, se agrega una entrada nueva que la reemplaza; la vieja no se borra.

## 2026-10-18 — PostgreSQL antes que Neo4j
La base de contratos ya vive en PostgreSQL en AWS y el equipo la conoce. Los cruces iniciales son de uno o dos saltos y se resuelven con JOINs e índices. Neo4j se evaluará cuando una consulta de tres o más saltos tarde más de dos segundos sobre datos reales. Mientras tanto, el grafo se dibuja en el cliente a partir de una consulta recursiva acotada.

## 2026-10-18 — Esquema separado `investigacion`
Todo lo nuevo va en su propio esquema para que una migración fallida o un cambio de modelo no toque el buscador que ya funciona. La relación con contratos es por llave foránea en una sola dirección.

## 2026-10-18 — Procesamiento local, resultados en AWS
AWS corre solo la base y la app. OCR, modelos de lenguaje y resolución corren en la Mac. Motivo: costo cero y los documentos no salen de la máquina. Consecuencia: el pipeline necesita conexión a la base de AWS desde local (túnel SSH o grupo de seguridad con la IP de Arturo) y se corre a mano o por cron local.

## 2026-10-18 — Modelo local con Ollama
Modelo inicial: el que mejor responda en pruebas con cinco actas reales en la Mac de Arturo. Candidatos a probar: `qwen2.5:7b` (buen español, salida JSON estable) y `llama3.1:8b`. El criterio es: respeta el esquema JSON en al menos 9 de 10 corridas y tarda menos de 90 segundos por acta. `ingesta` documenta aquí cuál ganó y con qué números.

## 2026-10-18 — Un prompt por tipo de documento
Un extractor genérico pide demasiado al modelo y falla de formas difíciles de probar. Un prompt por tipo tiene esquema propio, fixtures propios y se mejora sin romper los demás. El costo es mantener varios; se acepta.

## 2026-10-18 — El RFC es la única unión automática
Dos registros con el mismo RFC válido se unen solos. Todo lo demás pasa por la cola de candidatos y por un clic humano. Motivo: en periodismo una unión equivocada es una acusación equivocada.

## 2026-10-18 — Montos en centavos
`bigint` en centavos. Se evita `numeric` por costo en agregaciones y `float` por redondeo. Se muestra en pesos con separador de miles.

## 2026-10-18 — Nada se borra
Rechazar es cambiar `estado`. Unir es apuntar `canonica_id`. Todo se puede deshacer y toda decisión queda en bitácora con quién y cuándo.

## 2026-10-18 — Los contratos se referencian por su llave natural, vía `investigacion.contratos_ref`
`contratos.contratos` no tiene llave primaria de una columna. Su identidad es el índice único `idx_contrato_compuesto (codigo_contrato, titulo_contrato, proveedor_contratista)`, que es la misma llave del upsert de ambos ETL. Agregarle un `id` violaría el principio 6, y copiar las tres columnas en `vinculos` y `alertas` duplicaría texto y FK.

Se eligió una tabla puente `contratos_ref`: un `id bigint` propio y una sola FK compuesta hacia ese índice. El resto del módulo usa `contrato_id bigint`. Se mantiene aunque algún día aparezca una PK en contratos, porque la llave natural sobrevive a una recarga de la tabla y un `id` sustituto no.

Costos aceptados:
- No se pueden vincular contratos con alguna de las tres columnas en NULL.
- `TRUNCATE contratos.contratos`, y el `DELETE` de un contrato referenciado, fallan mientras exista la FK.

Spec: `specs/esquema-base.md`.

## 2026-10-18 — La base hace cumplir los principios, no solo el código
En `investigacion` la propia base hace cumplir tres reglas:
- Ninguna fila queda `confirmado` sin `revisado_por` y `revisado_en`, salvo `creado_por = 'resolucion:rfc'` (CHECK).
- Ninguna fila se borra ni se trunca (trigger).
- Los RFC genéricos `XAXX010101000` y `XEXX010101000` no se guardan en `entidades.rfc` (CHECK), porque con la unión automática por RFC juntarían a todos los extranjeros o al público en general.

Motivo: un error de un pipeline no debe poder saltarse un principio no negociable, y así `revisor` lo puede probar con un INSERT.

## 2026-10-18 — Un archivo es un documento
`documentos.fuente_id` es UNIQUE. Un PDF que trae varios documentos (por ejemplo, un expediente) se divide en archivos antes de entrar. Si esto estorba en la fase 2, se relaja con una migración propia.

## 2026-10-18 — La Mac se conecta al RDS por túnel de SSM
Se eligió el reenvío de puertos de AWS Systems Manager a través de la EC2 de la app (`i-0d9eeb1a818985c74`, us-east-2). Se descartaron el túnel SSH y la IP permitida en el grupo de seguridad.

Motivos:
- La EC2 ya está gestionada por SSM, porque así se despliega, y ya alcanza al RDS.
- No se abre ningún puerto: el RDS sigue sin acceso público y la EC2 no necesita el puerto 22 ni llaves.
- No depende de la IP de la casa, que cambia.
- Cuesta cero.

```bash
aws ssm start-session --region us-east-2 --target i-0d9eeb1a818985c74 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<endpoint del RDS>"],"portNumber":["5432"],"localPortNumber":["54320"]}'
# en otra terminal: DATABASE_URL apunta a localhost:54320 con sslmode=require
```

Requisitos:
- `brew install --cask session-manager-plugin` en la Mac (hoy no está instalado).
- Que el usuario IAM tenga permiso `ssm:StartSession` sobre ese documento y esa instancia.

El pipeline local usa la misma `DATABASE_URL`, apuntando al túnel.

## 2026-10-18 — La lista 69-B es una tabla, no un vínculo
Estar en la 69-B es un hecho oficial sobre un RFC, publicado por el SAT, no una relación entre dos entidades ni con un contrato. Por eso no cabe en `vinculos`, que exige como destino una entidad o un contrato.

- La lista se guarda en su propia tabla del esquema `investigacion`, una fila por RFC y publicación, con su `fuente_id`. Esa tabla la diseña la spec de la tarea 0.4 y la crea una migración `21_`.
- El cruce `proveedor_en_69b` y la ficha de entidad la consultan por RFC.
- `en_lista_69b` sale de la lista cerrada de tipos de vínculo.
- Ventaja: no hace falta un clic humano por cada uno de los miles de RFC de la lista para que el cruce funcione. Es un dato oficial que se consulta, no una afirmación que se agrega al grafo.

## Pendientes de decidir

- Si las respuestas de transparencia se procesan como un tipo único o se subdividen (oficios, anexos en Excel, versiones públicas).
- Librería del grafo en el cliente: sigma.js (más rápida con muchos nodos) o cytoscape.js (más opciones de layout). `frontend` prueba las dos con el mismo subgrafo y decide.
