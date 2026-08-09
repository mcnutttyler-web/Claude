import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.CARDPICK_DB_PATH ?? "./data/cardpick.db",
  },
} satisfies Config;
