/**
 * Autopilot — a thin, opinionated wrapper around Stagehand on a Browserbase
 * cloud browser. It owns the boring-but-fiddly parts so your script can be a
 * few lines of intent:
 *
 *   const bot = new Autopilot({ ...creds });
 *   await bot.init();
 *   await bot.goto("https://example.com");
 *   await bot.act("click the sign in button");
 *   await bot.screenshot("out.png");
 *   await bot.close();
 *
 * What it handles for you (the lessons baked in — see docs/GOTCHAS.md):
 *   • releases stale RUNNING sessions before connecting (concurrency-1 tiers)
 *   • exposes the *real* active page (the one with .keyboard/.mouse)
 *   • routes act/observe/extract through whichever Stagehand surface exists
 *   • optional proxy / captcha-solving / keepAlive, all off by default
 *   • clean teardown that also releases a keepAlive session so it stops billing
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { liveViewUrl, releaseRunningSessions, requestRelease } from "./session.js";

/** A Playwright-style page. Typed loosely so we don't pin a Stagehand version. */
export type Page = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

export interface AutopilotOptions {
  /** Browserbase API key (https://www.browserbase.com → Settings → API Keys). */
  browserbaseApiKey: string;
  /** Browserbase project id. */
  browserbaseProjectId: string;
  /** API key for the planning model Stagehand uses to turn intent into actions. */
  modelApiKey: string;
  /** Stagehand model id. Default: "google/gemini-2.5-flash". */
  modelName?: string;
  /** Route the session through a Browserbase proxy. Default: false. */
  proxies?: boolean;
  /** Let Browserbase attempt CAPTCHA solving on the session. Default: false. */
  solveCaptchas?: boolean;
  /** Keep the session alive after disconnect (you must release it later). Default: false. */
  keepAlive?: boolean;
  /** Cloud browser viewport. Default: 1440×900. */
  viewport?: { width: number; height: number };
  /** Release stale RUNNING sessions before connecting (dodges concurrency-1 429s). Default: true. */
  releaseStale?: boolean;
  /** Stagehand log verbosity (0 quiet … 2 chatty). Default: 0. */
  verbose?: 0 | 1 | 2;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

export class Autopilot {
  readonly stagehand: Stagehand;
  /** Browserbase session id, available after `init()`. */
  sessionId: string | null = null;

  private readonly opts: AutopilotOptions;
  private started = false;

  constructor(opts: AutopilotOptions) {
    this.opts = opts;
    // Pass the config through `any` so we stay tolerant of minor Stagehand
    // option-name churn across versions; the runtime shape below is field-tested.
    const config: any = {
      env: "BROWSERBASE",
      apiKey: opts.browserbaseApiKey,
      projectId: opts.browserbaseProjectId,
      model: { modelName: opts.modelName ?? DEFAULT_MODEL, apiKey: opts.modelApiKey },
      browserbaseSessionCreateParams: {
        projectId: opts.browserbaseProjectId,
        keepAlive: opts.keepAlive ?? false,
        proxies: opts.proxies ?? false,
        browserSettings: {
          solveCaptchas: opts.solveCaptchas ?? false,
          viewport: opts.viewport ?? DEFAULT_VIEWPORT,
        },
      },
      disablePino: true,
      verbose: opts.verbose ?? 0,
    };
    this.stagehand = new Stagehand(config);
  }

  /** Connect: release stale sessions (opt-out), start Stagehand, record the session id. */
  async init(): Promise<this> {
    if (this.opts.releaseStale ?? true) {
      await releaseRunningSessions(this.opts.browserbaseApiKey, this.opts.browserbaseProjectId);
    }
    await this.stagehand.init();
    this.sessionId = (this.stagehand as any).browserbaseSessionID ?? null;
    this.started = true;
    return this;
  }

  /**
   * The *active* page. Prefer this over `stagehand.page`: the active page is a
   * real Playwright page with `.keyboard` / `.mouse`, whereas the proxied
   * `stagehand.page` can be missing them on some versions (see GOTCHAS).
   */
  get page(): Page {
    const ctx: any = this.stagehand.context;
    if (ctx && typeof ctx.activePage === "function") return ctx.activePage();
    const pages: any[] = ctx?.pages?.() ?? [];
    return pages[pages.length - 1] ?? (this.stagehand as any).page;
  }

  /** Navigate the active page. Defaults to waiting for DOMContentLoaded. */
  async goto(url: string, opts?: { waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeout?: number }): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", ...opts });
  }

  /** Perform a natural-language action ("click the login button", "type 'hi' in the search box"). */
  async act(instruction: string): Promise<unknown> {
    const sh: any = this.stagehand;
    if (typeof sh.act === "function") return sh.act(instruction);
    return this.page.act(instruction);
  }

  /** Observe the page in natural language; returns the model's structured answer. */
  async observe(instruction?: string): Promise<unknown> {
    const sh: any = this.stagehand;
    if (typeof sh.observe === "function") return sh.observe(instruction);
    return this.page.observe(instruction);
  }

  /** Extract structured data. Pass `{ instruction, schema }` (schema = a zod schema). */
  async extract(args: { instruction: string; schema: unknown }): Promise<unknown> {
    const sh: any = this.stagehand;
    if (typeof sh.extract === "function") return sh.extract(args);
    return this.page.extract(args);
  }

  /** Inject cookies (bring-your-own-session auth). Use only with your own credentials. */
  async addCookies(cookies: Cookie[]): Promise<void> {
    await (this.stagehand.context as any).addCookies(cookies);
  }

  /** Save a screenshot of the active page. */
  async screenshot(path: string, opts?: { fullPage?: boolean }): Promise<void> {
    await this.page.screenshot({ path, fullPage: opts?.fullPage ?? false });
  }

  /** The interactive live-view URL (watch the cloud browser), or null if unavailable. */
  async liveViewUrl(): Promise<string | null> {
    if (!this.sessionId) return null;
    return liveViewUrl(this.opts.browserbaseApiKey, this.sessionId);
  }

  /**
   * Tear down. Closes Stagehand and, for a `keepAlive` session, also asks
   * Browserbase to release it so it stops billing. Pass `{ release: false }`
   * to leave a keepAlive session running on purpose.
   */
  async close(opts?: { release?: boolean }): Promise<void> {
    if (!this.started) return;
    try {
      await this.stagehand.close();
    } catch {
      /* already closed / disconnected — fine */
    }
    const release = opts?.release ?? true;
    if (release && this.opts.keepAlive && this.sessionId) {
      await requestRelease(this.opts.browserbaseApiKey, this.opts.browserbaseProjectId, this.sessionId);
    }
    this.started = false;
  }
}
