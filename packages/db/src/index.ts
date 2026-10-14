import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./delete.js";

export function makeDb(databaseUrl: string) {
  // POOL_MAX/PIPELINE are lowered (to 1) for the in-process PGlite dev DB,
  // whose socket server can't handle pipelined multi-statement traffic.
  // Neon/managed Postgres uses the larger production defaults.
  // `pipelining` is a valid postgres.js runtime option not present in 3.4.x types.
  const options = {
    max: Number(process.env.POOL_MAX ?? 5),
    idle_timeout: 20,
    pipelining: Number(process.env.PIPELINE ?? 3),
  } as Parameters<typeof postgres>[1];
  const client = postgres(databaseUrl, options);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof makeDb>;
