import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@funcatlas/shared/schema";
import { env } from "../env.js";

const client = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });
export type Db = typeof db;
