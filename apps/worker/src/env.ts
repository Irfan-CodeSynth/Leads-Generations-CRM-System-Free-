import dotenv from "dotenv";
import path from "node:path";

// Imported before anything that reads process.env at module load time.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
