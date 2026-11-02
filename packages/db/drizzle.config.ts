import "@procureflow/shared/load-env";
import { defineConfig } from "drizzle-kit";
import { getDatabaseConfig } from "@procureflow/shared";

const config = getDatabaseConfig();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: config.directUrl,
    ssl: config.ssl ? "require" : false,
  },
  strict: true,
  verbose: true,
});
