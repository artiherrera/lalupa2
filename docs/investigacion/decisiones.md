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

## Pendientes de decidir

- Cómo se conecta la Mac a PostgreSQL en AWS (túnel SSH vs. IP permitida). Decide Arturo.
- Si las respuestas de transparencia se procesan como un tipo único o se subdividen (oficios, anexos en Excel, versiones públicas).
- Librería del grafo en el cliente: sigma.js (más rápida con muchos nodos) o cytoscape.js (más opciones de layout). `frontend` prueba las dos con el mismo subgrafo y decide.
