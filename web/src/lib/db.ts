import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Created lazily (not at module load) so importing pure helpers that live
// alongside DB-touching code - e.g. from tests - doesn't require
// DATABASE_URL to be set.
let sqlClient: NeonQueryFunction<false, false> | undefined;
export function getSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    if (!process.env.DATABASE_URL) {
      throw new Error("Missing required environment variable: DATABASE_URL");
    }
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

export type User = {
  id: string;
  email: string;
  provider: string;
  created_at: string;
};

export async function getOrCreateUser(email: string, provider: string): Promise<User> {
  const sql = getSql();
  const [existing] = (await sql`SELECT * FROM users WHERE email = ${email}`) as User[];
  if (existing) return existing;

  const [created] = (await sql`
    INSERT INTO users (id, email, provider)
    VALUES (gen_random_uuid()::text, ${email}, ${provider})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING *
  `) as User[];

  return created;
}
