import "dotenv/config";
import bcrypt from "bcryptjs";
import { makeDb, users } from "./index.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment");
  process.exit(1);
}

const db = makeDb(process.env.DATABASE_URL!);
const hash = await bcrypt.hash(password, 10);

await db
  .insert(users)
  .values({ email, passwordHash: hash })
  .onConflictDoUpdate({ target: users.email, set: { passwordHash: hash } });

console.log(`Seeded user ${email}`);
process.exit(0);
