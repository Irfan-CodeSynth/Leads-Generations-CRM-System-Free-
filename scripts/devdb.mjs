/**
 * Dev-only Postgres for machines without Docker: PGlite (real Postgres/WASM)
 * exposed on the wire protocol so the web app and worker can connect as
 * separate processes. Data persists in ./data/pgdata. Production uses Neon.
 *
 *   node scripts/devdb.mjs [port]
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.argv[2] ?? 5433);
const db = new PGlite("./data/pgdata");
const server = new PGLiteSocketServer({ db, port, maxConnections: 6 });

await server.start();
console.log(`PGlite dev DB listening on postgres://localhost:${port}/pglite`);
