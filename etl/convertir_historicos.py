#!/usr/bin/env python3
"""
Convierte los archivos históricos de CompraNet (2006–2018) al CSV que entiende
/admin/cargar, para subirlos con la carga normal.

Formatos que reconoce (se detectan solos):
  - "cn5"  Contratos2010_2011_2012.csv … Contratos2017.csv
           CompraNet 5 histórico: encabezados en MAYÚSCULAS, fechas mes/día/año.
  - "2018" Contratos2018.csv
           Encabezados en español ("Importe del contrato"…), fechas ISO con " GMT".
  - "ex"   EX2006.xlsx … EX2011.xlsx
           Reportes de contrataciones por EXCEPCIÓN a la licitación (solo
           adjudicaciones directas e invitaciones a 3). Sin código de contrato:
           se arma uno estable con el número de procedimiento y el de contrato.

Qué arregla:
  - Fechas a 'YYYY-MM-DD HH:MM:SS' (la carga lee DD/MM; estos archivos traen MM/DD).
  - Tipo de procedimiento, tipo de contratación, estatus, carácter, etc. en
    MAYÚSCULAS y con acentos, como el resto de la base (los filtros comparan exacto).
  - anio_fuente = año de inicio del contrato (o de firma, en los EX).
  - moneda_norm; banderas 0/1 -> NO/SI.
  - created_at = diciembre de 2025 (archivo base), para que no salgan en /nuevos.
  - En los EX, la terminación "CIýN"/"SIýN" (acento perdido en el origen) -> "CIÓN".

Salida: CSV Latin-1, separado por comas, con los nombres de columna de la tabla,
comprimido en .csv.gz. Se sube tal cual en /admin/cargar (valores por defecto).

Uso:
  python etl/convertir_historicos.py ~/Downloads/Contratos2013.csv
  python etl/convertir_historicos.py ~/Downloads/EX2010.xlsx \
      --excluir ~/Downloads/Contratos2010_2011_2012.csv
  python etl/convertir_historicos.py ARCHIVO --salida carpeta/

--excluir (solo EX): omite los contratos que ya vienen en ese CSV de CompraNet 5
(mismo proveedor y mismo importe redondeado), para no contarlos dos veces.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import gzip
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from typing import Callable, Iterator
from xml.etree import ElementTree as ET

csv.field_size_limit(10**9)

# Columnas de salida (nombres de contratos.contratos). La carga las reconoce tal cual.
SALIDA = [
    "codigo_contrato", "titulo_contrato", "descripcion_contrato", "proveedor_contratista",
    "institucion", "siglas_institucion", "orden_de_gobierno", "clave_uc", "nombre_uc",
    "codigo_expediente", "titulo_expediente", "numero_procedimiento", "num_contrato",
    "tipo_procedimiento", "tipo_contratacion", "caracter_procedimiento", "forma_participacion",
    "estatus_contrato", "importe", "moneda", "moneda_norm", "anio_fuente",
    "fecha_publicacion", "fecha_apertura", "fecha_fallo", "fecha_inicio_contrato",
    "fecha_fin_contrato", "fecha_firma_contrato", "convenio_modificatorio", "contrato_marco",
    "compra_consolidada", "contrato_plurianual", "clave_programa_federal", "clave_cartera_shcp",
    "folio_rupc", "rfc", "estratificacion", "credito_externo", "organismo_financiero",
    "direccion_anuncio", "created_at",
]

# Fecha de alta en La Lupa. Los históricos entran como parte del archivo base (el
# mes de la migración inicial), no como contratos nuevos: si tomaran la fecha del
# día de la carga, más de un millón de contratos de 2006–2018 saldrían en /nuevos.
ALTA_ARCHIVO_BASE = "2025-12-01 00:00:00"

# Columnas categóricas que van en mayúsculas con acentos (como el resto de la base).
CATEGORICAS = {
    "tipo_procedimiento", "tipo_contratacion", "caracter_procedimiento",
    "forma_participacion", "estatus_contrato", "estratificacion",
}
BANDERAS = {"contrato_marco", "compra_consolidada", "contrato_plurianual", "credito_externo"}

# Palabras que en el origen vienen sin acento; la base las tiene acentuadas.
ACENTOS = [
    (r"\bADJUDICACION\b", "ADJUDICACIÓN"), (r"\bLICITACION\b", "LICITACIÓN"),
    (r"\bINVITACION\b", "INVITACIÓN"), (r"\bPUBLICA\b", "PÚBLICA"), (r"\bPUBLICO\b", "PÚBLICO"),
    (r"\bELECTRONICA\b", "ELECTRÓNICA"), (r"\bPEQUEÑA\b", "PEQUEÑA"),
]
# Valores completos que se reescriben (después de pasar a mayúsculas y acentuar).
EQUIVALENTES = {
    "INVITACIÓN A 3": "INVITACIÓN A CUANDO MENOS 3 PERSONAS",
}

# --- Mapeos encabezado de origen -> columna de salida ------------------------------

MAPA_CN5 = {
    "GOBIERNO": "orden_de_gobierno", "SIGLAS": "siglas_institucion", "DEPENDENCIA": "institucion",
    "CLAVEUC": "clave_uc", "NOMBRE_DE_LA_UC": "nombre_uc", "CODIGO_EXPEDIENTE": "codigo_expediente",
    "TITULO_EXPEDIENTE": "titulo_expediente", "NUMERO_PROCEDIMIENTO": "numero_procedimiento",
    "EXP_F_FALLO": "fecha_fallo", "PROC_F_PUBLICACION": "fecha_publicacion",
    "FECHA_APERTURA_PROPOSICIONES": "fecha_apertura", "CARACTER": "caracter_procedimiento",
    "TIPO_CONTRATACION": "tipo_contratacion", "TIPO_PROCEDIMIENTO": "tipo_procedimiento",
    "FORMA_PROCEDIMIENTO": "forma_participacion", "CODIGO_CONTRATO": "codigo_contrato",
    "TITULO_CONTRATO": "titulo_contrato", "FECHA_INICIO": "fecha_inicio_contrato",
    "FECHA_FIN": "fecha_fin_contrato", "IMPORTE_CONTRATO": "importe", "MONEDA": "moneda",
    "ESTATUS_CONTRATO": "estatus_contrato", "CONVENIO_MODIFICATORIO": "convenio_modificatorio",
    "CLAVE_PROGRAMA": "clave_programa_federal", "FECHA_CELEBRACION": "fecha_firma_contrato",
    "CONTRATO_MARCO": "contrato_marco", "COMPRA_CONSOLIDADA": "compra_consolidada",
    "PLURIANUAL": "contrato_plurianual", "CLAVE_CARTERA_SHCP": "clave_cartera_shcp",
    "FOLIO_RUPC": "folio_rupc", "PROVEEDOR_CONTRATISTA": "proveedor_contratista",
    "ESTRATIFICACION_MPC": "estratificacion", "C_EXTERNO": "credito_externo",
    "ORGANISMO": "organismo_financiero", "ANUNCIO": "direccion_anuncio",
}

MAPA_2018 = {
    "Orden de gobierno": "orden_de_gobierno", "Siglas de la Institución": "siglas_institucion",
    "Institución": "institucion", "Clave de la UC": "clave_uc", "Nombre de la UC": "nombre_uc",
    "Código del expediente": "codigo_expediente", "Título del expediente": "titulo_expediente",
    "Número del procedimiento": "numero_procedimiento", "Fecha de fallo": "fecha_fallo",
    "Fecha de publicación": "fecha_publicacion", "Fecha de apertura": "fecha_apertura",
    "Carácter del procedimiento": "caracter_procedimiento",
    "Tipo de contratación": "tipo_contratacion", "Tipo de procedimiento": "tipo_procedimiento",
    "Forma de participación": "forma_participacion", "Código del contrato": "codigo_contrato",
    "Núm. de control del contrato": "num_contrato", "Título del contrato": "titulo_contrato",
    "Descripción del contrato": "descripcion_contrato",
    "Fecha de inicio del contrato": "fecha_inicio_contrato",
    "Fecha de fin del contrato": "fecha_fin_contrato", "Importe del contrato": "importe",
    "Moneda del contrato": "moneda", "Estatus del contrato": "estatus_contrato",
    "Convenio modificatorio": "convenio_modificatorio",
    "Clave del programa federal": "clave_programa_federal",
    "Fecha de firma del contrato": "fecha_firma_contrato", "Contrato marco": "contrato_marco",
    "Compra consolidada": "compra_consolidada", "Contrato plurianual": "contrato_plurianual",
    "Clave de cartera SHCP": "clave_cartera_shcp", "Folio en el RUPC": "folio_rupc", "RFC": "rfc",
    "Proveedor o contratista": "proveedor_contratista",
    "Estratificación de la empresa": "estratificacion", "Crédito externo": "credito_externo",
    "Organismo financiero": "organismo_financiero", "Dirección del anuncio": "direccion_anuncio",
}

# Columnas del Excel EX (letra de columna -> columna de salida).
MAPA_EX = {
    "A": "institucion", "B": "nombre_uc", "C": "clave_uc", "D": "numero_procedimiento",
    "E": "tipo_procedimiento", "F": "tipo_contratacion", "G": "caracter_procedimiento",
    "H": "num_contrato", "I": "titulo_contrato", "J": "fecha_firma_contrato",
    "K": "importe", "L": "proveedor_contratista",
}
CABECERA_EX = "DEPENDENCIA / ENTIDAD"

# --- Limpieza ----------------------------------------------------------------------


def texto(v: str | None) -> str:
    return (v or "").strip()


def categoria(v: str) -> str:
    s = texto(v).upper()
    if not s:
        return ""
    for patron, rep in ACENTOS:
        s = re.sub(patron, rep, s)
    s = re.sub(r"\s+", " ", s)
    return EQUIVALENTES.get(s, s)


def bandera(v: str) -> str:
    s = texto(v)
    return {"0": "NO", "1": "SI"}.get(s, s.upper())


_FECHA_MDY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$")
_FECHA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*[A-Z]{2,4})?$")


def _armar(y: int, mo: int, d: int, h: int, mi: int, se: int) -> str:
    try:
        return dt.datetime(y, mo, d, h, mi, se).strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return ""


def fecha_mdy(v: str) -> str:
    """'12/16/2011', '1/4/2012 14:00' o ISO (con ' GMT') -> 'YYYY-MM-DD HH:MM:SS'."""
    s = texto(v)
    if not s:
        return ""
    m = _FECHA_MDY.match(s)
    if m:
        mo, d, y, h, mi, se = m.groups()
        return _armar(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(se or 0))
    return fecha_iso(s)


def fecha_iso(v: str) -> str:
    s = texto(v)
    m = _FECHA_ISO.match(s)
    if not m:
        return ""
    y, mo, d, h, mi, se = m.groups()
    return _armar(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(se or 0))


def fecha_excel(v: str) -> str:
    """Número de serie de Excel (días desde 1899-12-30) -> fecha."""
    s = texto(v)
    if not s:
        return ""
    try:
        dias = float(s)
    except ValueError:
        return fecha_mdy(s)
    return (dt.datetime(1899, 12, 30) + dt.timedelta(days=dias)).strftime("%Y-%m-%d %H:%M:%S")


def importe(v: str) -> str:
    s = re.sub(r"[^0-9.\-]", "", texto(v).replace(",", ""))
    try:
        n = float(s)
    except ValueError:
        return ""
    return f"{n:.2f}"


def reparar_acentos(s: str) -> str:
    # En los EX el origen perdió los acentos y dejó "ý". La gran mayoría son
    # terminaciones -CIÓN / -SIÓN / -XIÓN / -GIÓN; esas se recuperan sin ambigüedad.
    return re.sub(r"([CSXGcsxg][Ii])ý([Nn])", lambda m: m.group(1) + ("Ó" if m.group(2) == "N" else "ó") + m.group(2), s)


def clave_traslape(proveedor: str, monto: str) -> tuple[str, int]:
    p = unicodedata.normalize("NFD", proveedor.upper()).encode("ascii", "ignore").decode()
    try:
        m = round(float(monto or 0))
    except ValueError:
        m = 0
    return re.sub(r"[^A-Z0-9]", "", p)[:25], m


# --- Lectores ----------------------------------------------------------------------


def leer_csv(ruta: Path) -> tuple[list[str], Iterator[list[str]]]:
    f = open(ruta, encoding="latin1", newline="")
    r = csv.reader(f)
    return next(r), r


def leer_xlsx(ruta: Path) -> Iterator[dict[str, str]]:
    """Lee la primera hoja de un .xlsx sin dependencias (zip + XML)."""
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    z = zipfile.ZipFile(ruta)
    compartidas: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(ns + "si"):
            compartidas.append("".join(t.text or "" for t in si.iter(ns + "t")))
    hoja = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet"))[0]
    for fila in ET.fromstring(z.read(hoja)).iter(ns + "row"):
        out: dict[str, str] = {}
        for c in fila.iter(ns + "c"):
            col = re.match(r"[A-Z]+", c.get("r", "")).group(0)  # type: ignore[union-attr]
            v = c.find(ns + "v")
            if v is None:
                t = c.find(f"{ns}is/{ns}t")
                out[col] = t.text or "" if t is not None else ""
            else:
                out[col] = compartidas[int(v.text or 0)] if c.get("t") == "s" else (v.text or "")
        yield out


# --- Conversión --------------------------------------------------------------------


def limpiar(fila: dict[str, str], fecha: Callable[[str], str]) -> dict[str, str]:
    out = {c: texto(fila.get(c)) for c in SALIDA}
    for c in SALIDA:
        if c.startswith("fecha_"):
            out[c] = fecha(out[c])
        elif c in CATEGORICAS:
            out[c] = categoria(out[c])
        elif c in BANDERAS:
            out[c] = bandera(out[c])
    out["importe"] = importe(out["importe"])
    out["moneda"] = out["moneda"].upper()
    out["moneda_norm"] = out["moneda"]
    out["orden_de_gobierno"] = out["orden_de_gobierno"].upper()
    base = out["fecha_inicio_contrato"] or out["fecha_firma_contrato"] or out["fecha_publicacion"]
    out["anio_fuente"] = base[:4]
    out["created_at"] = ALTA_ARCHIVO_BASE
    return out


def filas_csv(ruta: Path, mapa: dict[str, str], fecha: Callable[[str], str], st: collections.Counter) -> Iterator[dict[str, str]]:
    cab, r = leer_csv(ruta)
    faltan = [k for k in mapa if k not in cab]
    if faltan:
        sys.exit(f"{ruta.name}: faltan columnas esperadas {faltan[:5]}…")
    idx = {mapa[k]: cab.index(k) for k in mapa}
    for row in r:
        if len(row) != len(cab):
            st["malformadas"] += 1
            continue
        yield limpiar({col: row[i] for col, i in idx.items()}, fecha)


def filas_ex(ruta: Path, excluir: set[tuple[str, int]], st: collections.Counter) -> Iterator[dict[str, str]]:
    filas = leer_xlsx(ruta)
    cab = next(filas)
    if texto(cab.get("A")) != CABECERA_EX:
        sys.exit(f"{ruta.name}: no parece un EX (primera celda {cab.get('A')!r})")
    for f in filas:
        d = {MAPA_EX[k]: v for k, v in f.items() if k in MAPA_EX}
        if not texto(d.get("proveedor_contratista")) and not texto(d.get("importe")):
            continue
        if "ý" in d.get("titulo_contrato", ""):
            st["titulos_con_acento_perdido"] += 1
        for c in ("titulo_contrato", "institucion", "proveedor_contratista", "nombre_uc"):
            d[c] = reparar_acentos(d.get(c, ""))
        if excluir and clave_traslape(d.get("proveedor_contratista", ""), d.get("importe", "")) in excluir:
            st["omitidas_traslape"] += 1
            continue
        d["moneda"] = "MXN"
        out = limpiar(d, fecha_excel)
        # Código estable: EX<año>-<procedimiento>-<contrato>; si se repite en el
        # archivo con otro título/proveedor, la llave de la tabla los distingue.
        out["codigo_contrato"] = f"EX{out['anio_fuente']}-{out['numero_procedimiento'] or 's-p'}-{out['num_contrato'] or 's-c'}"
        yield out


def detectar(ruta: Path) -> str:
    if ruta.suffix.lower() == ".xlsx":
        return "ex"
    with open(ruta, encoding="latin1") as f:
        primera = f.readline()
    if "CODIGO_CONTRATO" in primera:
        return "cn5"
    if "Importe del contrato" in primera:
        return "2018"
    sys.exit(f"{ruta.name}: formato no reconocido. Encabezados: {primera[:200]}")


def cargar_excluir(ruta: Path) -> set[tuple[str, int]]:
    cab, r = leer_csv(ruta)
    ip, ii = cab.index("PROVEEDOR_CONTRATISTA"), cab.index("IMPORTE_CONTRATO")
    return {clave_traslape(row[ip], row[ii]) for row in r if len(row) == len(cab)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archivo", type=Path)
    ap.add_argument("--salida", type=Path, default=None, help="carpeta de salida (por defecto, junto al archivo)")
    ap.add_argument("--excluir", type=Path, default=None, help="CSV de CompraNet 5 para omitir traslapes (solo EX)")
    a = ap.parse_args()

    ruta = a.archivo.expanduser()
    formato = detectar(ruta)
    st: collections.Counter = collections.Counter()
    if formato == "cn5":
        filas = filas_csv(ruta, MAPA_CN5, fecha_mdy, st)
    elif formato == "2018":
        filas = filas_csv(ruta, MAPA_2018, fecha_iso, st)
    else:
        excluir = cargar_excluir(a.excluir.expanduser()) if a.excluir else set()
        filas = filas_ex(ruta, excluir, st)

    carpeta = (a.salida or ruta.parent).expanduser()
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / f"lalupa_{ruta.stem}.csv.gz"
    anios: collections.Counter = collections.Counter()
    tipos: collections.Counter = collections.Counter()
    with gzip.open(destino, "wt", encoding="latin1", errors="replace", newline="") as g:
        w = csv.DictWriter(g, fieldnames=SALIDA)
        w.writeheader()
        for out in filas:
            if not out["codigo_contrato"]:
                st["sin_codigo"] += 1
                continue
            if formato == "ex" and "ý" in out["titulo_contrato"]:
                st["titulos_sin_reparar"] += 1
            for c in ("fecha_inicio_contrato", "fecha_firma_contrato"):
                if out[c][:4] and not ("2000" <= out[c][:4] <= "2030"):
                    st[f"{c}_rara"] += 1
            anios[out["anio_fuente"] or "(sin año)"] += 1
            tipos[out["tipo_procedimiento"] or "(vacío)"] += 1
            st["escritas"] += 1
            w.writerow(out)

    print(f"{ruta.name} [{formato}] -> {destino}")
    print("  " + ", ".join(f"{k}={v}" for k, v in sorted(st.items())))
    print("  años: " + ", ".join(f"{k}: {v}" for k, v in sorted(anios.items())))
    print("  procedimientos: " + "; ".join(f"{v}× {k}" for k, v in tipos.most_common(8)))


if __name__ == "__main__":
    main()
