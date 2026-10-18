<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Módulo de investigación

Esta sección vive al final de `AGENTS.md`, que `CLAUDE.md` importa. Complementa lo que ya dice sobre LaLupa; no lo reemplaza.

## Qué estamos construyendo

Una capa encima de LaLupa que convierte documentos sueltos (actas constitutivas, declaraciones patrimoniales, convenios, respuestas de transparencia, artículos) en un grafo de entidades y vínculos con evidencia, y lo cruza con los contratos que ya tenemos.

El flujo: documento entra → se clasifica → se extraen entidades según su tipo → se proponen vínculos → Arturo los acepta o rechaza → el grafo responde cruces (empresa nueva que gana contrato grande, socio que aparece en lista 69-B, mismo notario, mismo domicilio).

## Dónde corre cada cosa

- **AWS** sigue corriendo solo lo de hoy: PostgreSQL y la app Next.js (EC2 + systemd + CodeDeploy). Nada nuevo se despliega allá salvo las migraciones SQL y las pantallas nuevas de la app.
- **La Mac de Arturo** corre todo lo pesado: OCR con Tesseract, modelos con Ollama, resolución de entidades. Se conecta a PostgreSQL en AWS igual que lo hace `etl/load_contratos.py` hoy. Solo viajan texto extraído, entidades y metadatos.

## Principios que no se negocian

1. **Todo vínculo guarda su fuente.** Documento, página, fecha de consulta. Un vínculo sin `fuente_id` no existe.
2. **Confirmado e inferido van separados.** Lo que un humano aceptó lleva `estado = 'confirmado'`. Lo que propuso un modelo o un cruce automático lleva `estado = 'propuesto'`. Nunca se muestran mezclados sin distinguirlos.
3. **Nada entra al grafo sin clic humano.** Los modelos proponen; Arturo decide. Única excepción: dos registros con el mismo RFC válido se unen solos.
4. **Costo cero en infraestructura nueva.** No se agregan servicios de pago en AWS ni APIs externas sin preguntar.
5. **Los documentos no salen de la máquina local.** El PDF original se queda en disco local con su hash.
6. **Lo que ya funciona en LaLupa no se toca.** Las tablas de contratos, sus índices GIN y las consultas de búsqueda se quedan como están. El módulo vive en su propio esquema de PostgreSQL (`investigacion`) y se conecta por llaves foráneas en una sola dirección.
7. **Foco en dinero público.** Entidades: servidores públicos, empresas, dependencias, contratos, notarios, domicilios. No se construyen perfiles de particulares sin relación con recursos públicos.

## Dónde vive el módulo dentro del repo

```
db-migration/
  20_investigacion_esquema.sql        esquema completo (sigue la numeración de 10_, 11_)
  20_investigacion_esquema_down.sql   cada migración trae su reversa
  21_..., 22_...                       una migración por cambio
etl/
  load_contratos.py                    (existente, no se toca)
  investigacion/                       pipeline local en Python
    ingestar.py                        punto de entrada: python -m etl.investigacion.ingestar <archivo>
    tipos.py                           lista cerrada de tipos de documento
    normalizar.py                      la única función de normalización de nombres y RFC
    prompts/<tipo>.md                  un prompt por tipo, con versión en el encabezado
    esquemas/<tipo>.py                 modelo pydantic de la salida de cada tipo
    fuentes/<nombre>.py                importadores de fuentes públicas (69-B, DOF, DeclaraNet)
    resolucion/                        candidatos, umbrales, config.py
    tests/                             pytest; fixtures anonimizados por tipo
src/app/investigacion/                 pantallas nuevas (documentos, entidades, alertas)
src/lib/investigacion/                 consultas SQL de cruces y de fichas, una por archivo
docs/investigacion/                    esquema.md, roadmap.md, decisiones.md, specs/
.claude/agents/                        el equipo de agentes
```

## Convenciones del módulo

- Tablas, columnas y funciones en español sin acentos (`vinculos`, `entidades`, `fecha_consulta`). Comentarios en español.
- Las migraciones son archivos SQL numerados en `db-migration/`, como las existentes. Se prueban en PostgreSQL local (Docker) antes de aplicarse en AWS con el mismo flujo que `db-migration/README.md` describe.
- Python 3.11+, tipado, `pydantic` para validar la salida de los modelos, `ruff` para formato. Dependencias nuevas se agregan a `etl/requirements.txt` (el mismo venv que `load_contratos.py`).
- Las consultas de cruce van como SQL crudo con `pg` en `src/lib/investigacion/`, igual que el full-text search en `src/lib/contratos.ts` y el pool de `src/lib/db.ts`.
- TypeScript estricto, Tailwind 4, sin librería de componentes. Mismo patrón visual y de código que `src/app/_components/` y `src/app/nuevos/page.tsx`. Diseño limpio y minimalista.
- Next.js es más nuevo que el entrenamiento de los modelos: se lee `node_modules/next/dist/docs/` antes de escribir código de la app (regla ya vigente arriba).
- Nombres se guardan como vienen en la fuente, más `nombre_normalizado` para comparar. RFC es la llave fuerte cuando existe.
- Montos en centavos (`bigint`). Se muestran en pesos.
- Un prompt por tipo de documento, con su esquema y sus fixtures. No hay extractor genérico.
- Commits chicos, un cambio por commit, mensaje en español.

## Comandos del módulo

```bash
# migraciones (local primero)
psql "$DATABASE_URL" -f db-migration/20_investigacion_esquema.sql

# pipeline local (desde la raíz del repo, con el venv de etl/ activo)
python -m etl.investigacion.ingestar ruta/al/documento.pdf
python -m etl.investigacion.resolver --pendientes
python -m etl.investigacion.fuentes.sat_69b --archivo descargas/69b.csv
pytest etl/investigacion/tests

# modelo local
ollama serve
ollama pull qwen2.5:7b      # o el que diga docs/investigacion/decisiones.md
```

## Cómo trabajar con el equipo de agentes

Los agentes están en `.claude/agents/`. Cada uno tiene un rol fijo y lee este archivo antes de empezar. El ciclo para cualquier funcionalidad nueva:

1. `arquitecto` escribe la especificación en `docs/investigacion/specs/`.
2. El implementador que corresponda (`datos`, `fuentes`, `ingesta`, `resolucion`, `frontend`) la construye con sus pruebas.
3. `revisor` la revisa sin haber visto la construcción y reporta.
4. Se corrige lo que el revisor señaló y se cierra.

Para pedir trabajo: `@arquitecto especifica la tarea 0.1 del roadmap` o `@ingesta implementa docs/investigacion/specs/extractor-actas.md`.

El roadmap por fases está en `docs/investigacion/roadmap.md`. Nadie salta de fase sin que la anterior tenga sus pruebas en verde y la aprobación de `revisor`.
