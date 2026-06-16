# ETL de contratos

Carga/actualiza `contratos.contratos` desde un CSV (p. ej. exportes de CompraNet),
con limpieza + **upsert** (inserta nuevos, actualiza existentes por el índice único
`codigo_contrato + titulo_contrato + proveedor_contratista`). El `search_vector`
(columna generada) se recalcula solo.

## Requisitos
```bash
cd etl
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Uso
```bash
# misma cadena que la app (la base es `lalupa`)
export DATABASE_URL='postgresql://postgres:PASS@HOST:5432/lalupa?sslmode=no-verify'

# 1) Previsualiza el mapeo de columnas SIN escribir nada:
python load_contratos.py datos.csv --dry-run

# 2) Carga de verdad:
python load_contratos.py datos.csv

# Opciones: --encoding latin-1   --delimiter ';'   --batch 5000
```

## Ajustes
- El script mapea encabezados del CSV a columnas de la tabla por **nombre normalizado**
  (sin acentos, minúsculas). Lo que no calce, agrégalo en el diccionario `ALIAS` dentro
  de `load_contratos.py`, por ejemplo `"monto del contrato": "importe_contrato"`.
- Fechas: ajusta `DATE_FORMATS` si tu CSV trae otro formato.
- El CSV **debe** traer las 3 columnas clave del upsert (o mapearlas en `ALIAS`).

## Dónde correrlo
- **Local** (mientras el RDS sea alcanzable desde tu Mac).
- **En el EC2** (recomendado tras cerrar el RDS): está en la misma VPC, así que va más
  rápido y no requiere abrir la base. `scp` el CSV al EC2 y corre el script ahí, o usa un
  túnel SSH: `ssh -L 5432:lalupadb...:5432 ec2-user@3.20.70.37` y conéctate a `localhost`.
