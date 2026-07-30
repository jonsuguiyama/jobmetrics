import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const sqlMock = vi.fn();
const neonMock = vi.fn().mockReturnValue(sqlMock);
vi.mock("@neondatabase/serverless", () => ({ neon: neonMock }));

describe("db", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it("throws a clear error when DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { getOrCreateUser } = await import("./db.js");

    await expect(getOrCreateUser("a@b.com", "github")).rejects.toThrow(
      "Missing required environment variable: DATABASE_URL"
    );
  });

  it("returns the existing user without inserting when one is already found", async () => {
    const existing = { id: "u1", email: "a@b.com", provider: "github", created_at: "2026-01-01" };
    sqlMock.mockResolvedValueOnce([existing]);

    vi.resetModules();
    const { getOrCreateUser } = await import("./db.js");
    const user = await getOrCreateUser("a@b.com", "github");

    expect(user).toEqual(existing);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("creates the user when no existing row is found", async () => {
    const created = { id: "u2", email: "new@b.com", provider: "google", created_at: "2026-01-01" };
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

    vi.resetModules();
    const { getOrCreateUser } = await import("./db.js");
    const user = await getOrCreateUser("new@b.com", "google");

    expect(user).toEqual(created);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
