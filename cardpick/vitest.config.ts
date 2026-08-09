import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every test file gets its own module registry, so this must be a
    // shared on-disk db (env var read at import time). Tests use unique
    // fixture names to avoid colliding with each other's rows.
    env: {
      CARDPICK_DB_PATH: "./.vitest-data/test.db",
      CARDPICK_BACKUP_DIR: "./.vitest-data/backups",
    },
    fileParallelism: false,
    setupFiles: ["./src/test/setup.ts"],
  },
});
