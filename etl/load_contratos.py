#!/usr/bin/env python3
"""
ETL: carga/actualiza contratos en `contratos.contratos` desde un CSV (CompraNet).

Qué hace:
  - Mapea los encabezados del CSV a las columnas de la tabla (automático por nombre
    normalizado, + ALIAS manual para los que no calcen).
  - Limpia y normaliza: texto (trim, vacío -> NULL), fechas (varios formatos),
    importes ($ , -> número), enteros.
  - UPSERT por el índice único (codigo_contrato, titulo_contrato, proveedor_contratista):
    inserta los nuevos y actualiza los existentes.
  - `search_vector` (columna generada) se recalcula solo en cada insert/update.

Uso:
  export DATABASE_URL='postgresql://postgres:PASS@HOST:5432/lalupa?sslmode=no-verify'
  python load_contratos.py archivo.csv                 # carga
  python load_contratos.py archivo.csv --dry-run       # solo previsualiza el mapeo
  python load_contratos.py archivo.csv --encoding latin-1 --delimiter ';'
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import unicodedata
from datetime import datetime

import psycopg2
from psycopg2.extras import execute_values

# --- Columnas de la tabla que aceptamos del CSV (created_at y search_vector se generan solos) ---
TEXT_COLS = [
    "caracter_procedimiento", "clave_cartera_shcp", "clave_programa_federal", "clave_uc",
    "codigo_contrato", "codigo_expediente", "compra_consolidada", "contrato_marco",
    "contrato_plurianual", "convenio_modificatorio", "credito_externo", "descripcion_contrato",
    "direccion_anuncio", "estatus_contrato", "estratificacion", "folio_rupc", "forma_participacion",
    "institucion", "moneda", "nombre_uc", "num_contrato", "numero_procedimiento", "orden_de_gobierno",
    "organismo_financiero", "proveedor_contratista", "referencia_expediente", "rfc",
    "siglas_institucion", "tipo_contratacion", "tipo_procedimiento", "titulo_contrato",
    "titulo_expediente", "anio_fuente", "moneda_norm",
]
DATE_COLS = [
    "fecha_apertura", "fecha_fallo", "fecha_fin_contrato", "fecha_firma_contrato",
    "fecha_inicio_contrato", "fecha_publicacion",
]
FLOAT_COLS = ["importe_contrato", "importe"]
INT_COLS = ["anio_fundacion_empresa"]

ALL_COLS = TEXT_COLS + DATE_COLS + FLOAT_COLS + INT_COLS
CONFLICT = ["codigo_contrato", "titulo_contrato", "proveedor_contratista"]  # índice único

# Si un encabezado del CSV no calza por nombre, mapéalo aquí -> "encabezado csv": "columna_tabla"
ALIAS: dict[str, str] = {
    # "fecha del contrato": "fecha_firma_contrato",
    # "monto del contrato": "importe_contrato",
    # "dependencia": "institucion",
}

DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y",
    "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y",
]


def norm_header(h: str) -> str:
    h = h.strip().lower()
    h = "".join(c for c in unicodedata.normalize("NFD", h) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "_", h).strip("_")


def clean_text(v):
    if v is None:
        return None
    v = v.strip()
    return v or None


def clean_float(v):
    v = clean_text(v)
    if v is None:
        return None
    v = re.sub(r"[^0-9.\-]", "", v.replace(",", ""))
    try:
        return float(v) if v not in ("", "-", ".") else None
    except ValueError:
        return None


def clean_int(v):
    f = clean_float(v)
    return int(f) if f is not None else None


def clean_date(v):
    v = clean_text(v)
    if v is None:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None  # formato desconocido -> NULL


def cleaner_for(col):
    if col in DATE_COLS:
        return clean_date
    if col in FLOAT_COLS:
        return clean_float
    if col in INT_COLS:
        return clean_int
    return clean_text


def build_mapping(headers):
    table_set = set(ALL_COLS)
    mapping = {}
    for h in headers:
        if h in ALIAS:
            mapping[h] = ALIAS[h]
        elif norm_header(h) in table_set:
            mapping[h] = norm_header(h)
    return mapping


def main():
    ap = argparse.ArgumentParser(description="Carga/actualiza contratos desde CSV.")
    ap.add_argument("csv", help="ruta al archivo CSV")
    ap.add_argument("--encoding", default="utf-8-sig")
    ap.add_argument("--delimiter", default=",")
    ap.add_argument("--batch", type=int, default=5000)
    ap.add_argument("--dry-run", action="store_true", help="muestra el mapeo y no escribe")
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("Falta DATABASE_URL en el entorno.")

    with open(args.csv, newline="", encoding=args.encoding) as f:
        reader = csv.DictReader(f, delimiter=args.delimiter)
        headers = reader.fieldnames or []
        mapping = build_mapping(headers)
        cols = list(dict.fromkeys(mapping.values()))
        if not cols:
            sys.exit(f"Ningún encabezado calzó con la tabla.\nEncabezados: {headers}\nAjusta ALIAS.")
        faltan = [c for c in CONFLICT if c not in cols]
        if faltan:
            sys.exit(f"Faltan columnas clave para el upsert: {faltan}. El CSV debe traerlas (o mapéalas en ALIAS).")

        print(f"Columnas mapeadas ({len(cols)}): {cols}")
        no_mapeadas = [h for h in headers if h not in mapping]
        if no_mapeadas:
            print(f"Encabezados ignorados (sin columna): {no_mapeadas}")

        rev = {dst: src for src, dst in mapping.items()}
        cleaners = {c: cleaner_for(c) for c in cols}
        rows = [[cleaners[c](r.get(rev[c])) for c in cols] for r in reader]

    print(f"Filas leídas: {len(rows)}")
    if args.dry_run:
        if rows:
            print("Ejemplo de fila transformada:")
            for c, v in zip(cols, rows[0]):
                print(f"  {c} = {v!r}")
        return

    set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols if c not in CONFLICT)
    sql = (
        f"INSERT INTO contratos.contratos ({', '.join(cols)}) VALUES %s "
        f"ON CONFLICT ({', '.join(CONFLICT)}) DO UPDATE SET {set_clause}"
    )

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            for i in range(0, len(rows), args.batch):
                execute_values(cur, sql, rows[i:i + args.batch], page_size=args.batch)
                print(f"  upsert {min(i + args.batch, len(rows))}/{len(rows)}")
        conn.commit()
        print("✓ Carga completa.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
