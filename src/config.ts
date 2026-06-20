/** Load + validate the credentials web-autopilot needs from the environment. */
import "dotenv/config";

export interface Env {
  browserbaseApiKey: string;
  browserbaseProjectId: string;
  modelApiKey: string;
  modelName?: string;
}

function required(name: string, aliases: string[] = []): string {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  const alt = aliases.length ? ` (or ${aliases.join(" / ")})` : "";
  throw new Error(
    `Missing required env var ${name}${alt}. ` +
      `Copy .env.example to .env and fill it in (see the README "Setup" section).`,
  );
}

/**
 * Read Browserbase + model credentials from process.env (and a local .env via
 * dotenv). Throws a helpful error naming the first missing variable.
 */
export function loadEnv(): Env {
  return {
    browserbaseApiKey: required("BROWSERBASE_API_KEY"),
    browserbaseProjectId: required("BROWSERBASE_PROJECT_ID"),
    // GEMINI_API_KEY / GOOGLE_API_KEY accepted as aliases since Gemini is the default.
    modelApiKey: required("MODEL_API_KEY", ["GEMINI_API_KEY", "GOOGLE_API_KEY"]),
    modelName: process.env.MODEL_NAME?.trim() || undefined,
  };
}
