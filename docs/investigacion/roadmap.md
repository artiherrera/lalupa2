# Roadmap del módulo de investigación

Seis fases. Cada una termina con algo que Arturo puede usar. Nadie empieza la siguiente sin que las pruebas de la anterior estén en verde y `revisor` haya aprobado.

## Fase 0 — Cimientos
**Resultado:** el esquema existe y la lista 69-B cruza contra Compranet.

| # | Tarea | Agente | Spec |
|---|---|---|---|
| 0.1 | Migración `db-migration/20_investigacion_esquema.sql` con su reversa | datos | `specs/esquema-base.md` |
| 0.2 | Entidad `empresa` por cada RFC de proveedor en contratos (carga única) | resolucion | `specs/proveedores-a-entidades.md` |
| 0.3 | Función única de normalización de nombres y RFC, con pruebas | resolucion | `specs/normalizacion.md` |
| 0.4 | Importador SAT 69-B | fuentes | `specs/importador-69b.md` |
| 0.5 | Cruce `proveedor_en_69b` | datos | `specs/cruce-69b.md` |
| 0.6 | Revisión de la fase | revisor | |

Cómo se ve el éxito: una consulta SQL devuelve todos los contratos cuyo proveedor está en la 69-B, con monto total y etapa de la lista.

## Fase 1 — Primer documento de principio a fin
**Resultado:** arrastras un acta constitutiva y revisas sus vínculos en pantalla.

| # | Tarea | Agente | Spec |
|---|---|---|---|
| 1.1 | Pipeline base: hash, texto, OCR, bitácora de corridas | ingesta | `specs/pipeline-base.md` |
| 1.2 | Clasificador con lista cerrada de tipos y bandeja "revisar" | ingesta | `specs/clasificador.md` |
| 1.3 | Extractor de `acta_constitutiva` con fixtures | ingesta | `specs/extractor-actas.md` |
| 1.4 | Resolución de las entidades extraídas contra las existentes | resolucion | `specs/resolucion-v1.md` |
| 1.5 | Bandeja de documentos y pantalla de revisión | frontend | `specs/pantalla-revision.md` |
| 1.6 | Revisión de la fase | revisor | |

Cómo se ve el éxito: diez actas reales procesadas, al menos ocho clasificadas bien, y cada vínculo aceptado en pantalla queda `confirmado` con su evidencia.

## Fase 2 — Más tipos de documento
**Resultado:** declaraciones patrimoniales, convenios y respuestas de transparencia entran por el mismo flujo.

| # | Tarea | Agente |
|---|---|---|
| 2.1 | Extractor `declaracion_patrimonial` | ingesta |
| 2.2 | Extractor `convenio` | ingesta |
| 2.3 | Extractor `respuesta_transparencia` | ingesta |
| 2.4 | Extractor `articulo_prensa` (solo entidades mencionadas, sin vínculos fuertes) | ingesta |
| 2.5 | Importador DeclaraNet | fuentes |
| 2.6 | Revisión de la fase | revisor |

## Fase 3 — La ficha de entidad y el grafo
**Resultado:** buscas una empresa y ves todo lo que sabes de ella, con su mapa de relaciones.

| # | Tarea | Agente |
|---|---|---|
| 3.1 | Consultas de ficha: contratos, vínculos, documentos, variantes | datos |
| 3.2 | Ficha de entidad con grafo de dos saltos | frontend |
| 3.3 | Pantalla de candidatos de resolución (unir / separar) | frontend |
| 3.4 | Deshacer uniones | datos + frontend |
| 3.5 | Revisión de la fase | revisor |

## Fase 4 — Cruces y alertas
**Resultado:** el sistema avisa solo cuando encuentra algo.

| # | Tarea | Agente |
|---|---|---|
| 4.1 | Los seis cruces base como consultas con nombre | datos |
| 4.2 | Corrida semanal local que ejecuta cruces y escribe `alertas` | ingesta |
| 4.3 | Pantalla de alertas | frontend |
| 4.4 | Revisión de la fase | revisor |

## Fase 5 — Publicar
**Resultado:** del grafo sale material para una placa o un video.

| # | Tarea | Agente |
|---|---|---|
| 5.1 | Exportar subgrafo de una entidad a JSON y SVG con leyenda confirmado / propuesto | frontend |
| 5.2 | Exportar "expediente": lista de afirmaciones con su fuente, página y fragmento | datos + frontend |
| 5.3 | Revisión de la fase | revisor |

## Qué no está en el roadmap, a propósito

- Monitoreo de redes sociales: eso es SENTENTIA, se integra después por `entidades` si hace falta.
- Búsqueda semántica con embeddings: hasta que el full-text se quede corto.
- Neo4j: hasta que las consultas de más de tres saltos sean lentas en PostgreSQL.
- Multiusuario: Arturo es el único usuario del módulo por ahora.
