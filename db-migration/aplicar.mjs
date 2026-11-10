// Aplica un archivo SQL de db-migration/ en la base de la app, una sentencia a la vez.
// Pensado para correr en la EC2 (la RDS ya no es pública), desde /opt/lalupa2:
//   node db-migration/aplicar.mjs db-migration/12_numero_contrato_index.sql
//
// Una sentencia por consulta porque CREATE INDEX CONCURRENTLY no puede ir dentro de
// una transacción (varias sentencias en una sola consulta lo serían). Sin límite de
// tiempo: un índice sobre millones de filas tarda minutos.
import { readFileSync } from "node:fs";
import pg from "pg";

const archivo = process.argv[2];
if (!archivo) {
  console.error("uso: node db-migration/aplicar.mjs <archivo.sql>");
  process.exit(1);
}

// DATABASE_URL del entorno o de .env.local (así la tiene la EC2).
let url = process.env.DATABASE_URL;
if (!url) {
  const env = readFileSync(".env.local", "utf8");
  url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}
if (!url) {
  console.error("Falta DATABASE_URL (ni en el entorno ni en .env.local)");
  process.exit(1);
}

// Fuera comentarios de línea (pueden traer ';') y se parte por ';' al final de línea.
const sentencias = readFileSync(archivo, "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter(Boolean);

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});
await client.connect();
await client.query("SET statement_timeout = 0");
for (const s of sentencias) {
  const t0 = Date.now();
  console.log(`→ ${s.split("\n")[0]}`);
  await client.query(s);
  console.log(`  listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
await client.end();
console.log(`${sentencias.length} sentencias aplicadas de ${archivo}`);
