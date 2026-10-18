# Spec: extractor de actas constitutivas

Versión 1 — 2026-10-18. Ejemplo del formato que `arquitecto` produce. Tarea 1.3 del roadmap.

## Objetivo
Que un acta constitutiva en PDF (con texto o escaneada) se convierta en una empresa, sus socios con porcentaje, su administrador, su notario y su domicilio, cada uno con el fragmento del acta que lo respalda, listos para revisar en pantalla.

## Alcance
Entra: actas constitutivas de sociedades mexicanas (S.A., S.A. de C.V., S. de R.L., S.A.P.I.), en español, en PDF. Hasta 40 páginas.
Queda fuera: asambleas posteriores (cambios de socios, aumentos de capital), poderes notariales, actas en otro idioma. Esos serán tipos propios en la fase 2.

## Modelo de datos
Sin tablas nuevas. Usa `documentos`, `entidades`, `vinculos` y `evidencias` del esquema base.

## Flujo
1. `ingesta` recibe la ruta del PDF. Calcula hash; si existe en `fuentes`, termina con mensaje "ya procesado".
2. Extrae texto con pdfplumber. Si el texto tiene menos de 200 caracteres por página en promedio, corre Tesseract (`spa`) sobre cada página rasterizada a 300 dpi.
3. El clasificador devuelve `acta_constitutiva` con confianza ≥ 0.80. Si devuelve otro tipo o menor confianza, el documento va a `revisar` y el flujo termina.
4. Se arma el prompt `etl/investigacion/prompts/acta_constitutiva.md` (versión actual) con el texto completo. Si el texto supera el contexto del modelo, se envían las primeras 12 páginas y las últimas 3 (la constitución y las firmas suelen estar ahí) y se registra que fue parcial.
5. El modelo devuelve JSON. Se valida contra `etl/investigacion/esquemas/acta_constitutiva.py`. Si falla, un reintento con el error de validación incluido en el prompt. Si vuelve a fallar, el documento va a `revisar` con el error guardado.
6. Por cada persona y empresa del JSON se crea una fila en `entidades` con `estado = 'propuesto'`, `creado_por = 'modelo:<nombre>'`, `fuente_id` del acta, y una fila en `evidencias` con página y fragmento.
7. Por cada relación se crea una fila en `vinculos` (`socio_de` con `atributos.porcentaje`, `administra`, `protocolizo`, `domiciliada_en`) con su evidencia.
8. Se llama a `resolucion` con las entidades nuevas; los candidatos que encuentre quedan en `candidatos`.
9. El documento pasa a `estado = 'pendiente'` (listo para revisión humana). Se cierra la corrida en `corridas` con tiempos por etapa.

## Esquema de salida del modelo

```python
class Persona(BaseModel):
    nombre: str
    rol: Literal["socio", "administrador_unico", "representante_legal", "comisario", "notario", "otro"]
    acciones: int | None = None
    porcentaje: float | None = None
    fragmento: str          # literal, máximo 300 caracteres
    pagina: int | None = None

class Empresa(BaseModel):
    denominacion: str
    forma_juridica: str | None = None
    domicilio: str | None = None
    fecha_constitucion: date | None = None
    capital_centavos: int | None = None
    fragmento: str
    pagina: int | None = None

class Notaria(BaseModel):
    nombre_notario: str
    numero: int | None = None
    ciudad: str | None = None
    fragmento: str

class ActaConstitutiva(BaseModel):
    empresa: Empresa
    personas: list[Persona]
    notaria: Notaria | None = None
    texto_parcial: bool = False
```

## Reglas
- El modelo no infiere. Si el acta no dice el porcentaje, `porcentaje` va `null`. Si dice acciones pero no porcentaje, `ingesta` lo calcula y lo marca en `atributos.porcentaje_calculado = true`.
- Un fragmento que no se encuentre literalmente en `documentos.texto` (tolerando espacios y mayúsculas) invalida ese dato: se descarta y se registra en la corrida. Esto evita que el modelo invente.
- Nombres se guardan como vienen; la normalización ocurre en `nombre_normalizado`.
- Tiempo máximo por acta: 3 minutos. Si se excede, el documento va a `revisar` con motivo `tiempo`.
- Ningún dato del acta se envía a un servicio externo.

## Criterios de aceptación
1. Con los fixtures `etl/investigacion/tests/fixtures/acta_constitutiva/` (mínimo 3 actas, al menos una escaneada), la extracción coincide con la salida esperada en empresa, socios y notario.
2. Un acta ya procesada (mismo hash) no genera filas nuevas.
3. Un fragmento inventado (fixture con salida manipulada) se descarta y queda registrado.
4. Un JSON inválido en el primer intento se corrige en el reintento, o el documento termina en `revisar` con el error guardado.
5. Todas las entidades y vínculos creados tienen `fuente_id` y al menos una evidencia.
6. La corrida registra tiempo por etapa y versión del prompt.
7. `pytest etl/investigacion/tests/test_acta_constitutiva.py` pasa.

## Agente responsable
`ingesta`. `resolucion` provee la función de normalización (tarea 0.3) antes de que esto empiece.

## Dependencias
Fase 0 completa (esquema, normalización). Clasificador (tarea 1.2) funcionando.
