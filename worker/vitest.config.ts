import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Bootstrap wiring, not logic - immediately invokes main() at import
      // time (real amqplib/ws/ioredis connections), so it isn't meaningfully
      // unit-testable without mocking the entire dependency graph just to
      // assert the wiring order, which is what integration/e2e tests are for.
      exclude: ["src/index.ts"]
    }
  }
});
