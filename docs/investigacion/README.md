# Equipo de agentes para el módulo de investigación de LaLupa

Siete agentes con roles fijos, un archivo de contexto, un esquema de datos, un roadmap por fases y una spec de ejemplo. Todo en español y pensado para Claude Code, aunque los prompts de cada agente sirven igual pegados en cualquier otra herramienta.

## Instalación (un solo paso pendiente)

Los archivos de los agentes están en `docs/investigacion/agentes/`. Claude Code los lee desde `.claude/agents/`, así que hay que copiarlos ahí una vez:

```bash
mkdir -p .claude/agents && cp docs/investigacion/agentes/*.md .claude/agents/
```

Si después editas un agente, edítalo en `.claude/agents/` (la copia en `docs/` es solo la versión inicial).

## Qué hay instalado

```
.claude/agents/arquitecto.md
.claude/agents/datos.md
.claude/agents/fuentes.md
.claude/agents/ingesta.md
.claude/agents/resolucion.md
.claude/agents/frontend.md
.claude/agents/revisor.md
AGENTS.md                       ← sección «Módulo de investigación» al final (CLAUDE.md lo importa)
docs/investigacion/esquema.md
docs/investigacion/roadmap.md
docs/investigacion/decisiones.md
docs/investigacion/specs/extractor-actas.md
docs/investigacion/README.md    ← este archivo
```

Claude Code detecta los agentes de `.claude/agents/` automáticamente. Los invocas por nombre.

## El equipo

| Agente | Qué hace | Qué no hace |
|---|---|---|
| `arquitecto` | Convierte una idea en spec: objetivo, modelo de datos, flujo, reglas, criterios de aceptación | No escribe código |
| `datos` | Esquema `investigacion`, migraciones, consultas de cruce | No toca las tablas de contratos |
| `fuentes` | Investiga fuentes oficiales (69-B, DOF, DeclaraNet) y escribe importadores | No usa bases filtradas |
| `ingesta` | Pipeline local: OCR, clasificación, extracción con Ollama, un prompt por tipo | No manda documentos a servicios externos |
| `resolucion` | Decide si dos registros son la misma entidad; umbrales, candidatos, pruebas de precisión | No une nada sin RFC idéntico o clic humano |
| `frontend` | Pantallas en Next.js: bandeja, revisión, ficha con grafo, alertas | No decide estados desde el cliente |
| `revisor` | Revisa trabajo terminado sin haberlo visto construir; corre pruebas; reporta | No corrige, solo reporta |

## El ciclo de trabajo

```
tú → @arquitecto "especifica X"
        ↓ spec en docs/investigacion/specs/
tú → @<implementador> "implementa docs/investigacion/specs/x.md"
        ↓ código + pruebas
tú → @revisor "revisa la implementación de docs/investigacion/specs/x.md"
        ↓ reporte: aprobado | cambios menores | regresar
tú → @<implementador> "corrige lo que señaló el revisor"
```

Tres reglas que hacen que esto funcione:
1. Sin spec no hay implementación. Si le pides algo directo a `ingesta`, te va a mandar con `arquitecto`.
2. `revisor` no participa en la construcción. Por eso encuentra cosas.
3. Una fase a la vez. El roadmap dice cuál sigue.

## Por dónde empezar

El primer comando real:

```
@arquitecto especifica la tarea 0.1 del roadmap: la migración del esquema investigacion completo, usando docs/investigacion/esquema.md como base
```

Luego `@datos implementa docs/investigacion/specs/esquema-base.md` y `@revisor revisa docs/investigacion/specs/esquema-base.md`.

La fase 0 completa (esquema + 69-B + primer cruce) es un fin de semana de trabajo con los agentes. La fase 1 (primer acta de principio a fin) es otro.

## Dos cosas que tienes que decidir tú

Están en `docs/investigacion/decisiones.md`, al final:
- Cómo se conecta tu Mac a PostgreSQL en AWS (túnel SSH o IP permitida en el grupo de seguridad).
- Qué modelo de Ollama usar; `ingesta` lo prueba con cinco actas reales y te reporta.
