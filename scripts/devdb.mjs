/**
 * Dev-only Postgres for machines without Docker: PGlite (real Postgres/WASM)
 * exposed on the wire protocol so the web app and worker can connect as
 * separate processes. Data persists in ./data/pgdata. Production uses Neon.
 *
 *   node scripts/devdb.mjs [port] [--data <dir>]
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.argv[2] ?? 5433);
const flag = process.argv.indexOf("--data");
const dataDir = flag === -1 ? "./data/pgdata" : process.argv[flag + 1];
const db = new PGlite(dataDir);
// Each Next.js module graph (RSC pages vs route handlers, and every dev
// hot-reload of them) holds its own pooled connection, plus the worker and any
// script — so a handful of clients is normal. Overflow is fatal: the server
// resets the socket and the app sees a bare "read ECONNRESET".
const server = new PGLiteSocketServer({ db, port, maxConnections: 50 });

await server.start();
console.log(`PGlite dev DB listening on postgres://localhost:${port}/pglite (data: ${dataDir})`);
