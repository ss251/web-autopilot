/**
 * Self-improving browser automation — the "auto-research" loop.
 *
 * Inspired by Browserbase's `autobrowse` skill and Andrej Karpathy's autoresearch
 * harness: instead of hand-tuning brittle clicks, you give the loop an objective
 * and a way to check success, and it iterates —
 *
 *     propose → run (agent) → verify → reflect → repeat
 *
 * Each failed attempt is fed (with its trace) to a model that rewrites the
 * strategy; the loop keeps going until the task passes `passesToWin` times in a
 * row (reliable, not lucky) or it runs out of iterations. The evolved strategy
 * is returned (and optionally written to disk) as a durable, reusable skill —
 * the automation equivalent of compiling your learnings instead of relearning
 * them every run.
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import type { Autopilot, AgentRunResult } from "./autopilot.js";
import { geminiComplete } from "./llm.js";

export interface Task {
  /** Short slug used for logging + the saved strategy file. */
  name: string;
  /** Page to start each attempt on. */
  url: string;
  /** Natural-language objective handed to the agent. */
  goal: string;
  /**
   * Deterministic success check, run after each attempt. Return true = passed.
   * Prefer this over the LLM judge when you can express success in code
   * (URL changed, element present, value correct) — it's free and reliable.
   */
  verify?: (bot: Autopilot) => Promise<boolean>;
  /** Convenience verifier: pass if the page's HTML contains this string. */
  successText?: string;
}

export interface ImproveOptions {
  /** Max attempts before giving up. Default 5. */
  maxIterations?: number;
  /** Consecutive passes required to declare the strategy reliable. Default 2. */
  passesToWin?: number;
  /** Agent steps allowed per attempt. Default 12. */
  maxSteps?: number;
  /** Seed strategy (e.g. a previously-evolved one to refine). */
  initialStrategy?: string;
  /** If set, write the evolved strategy here as markdown when the loop ends. */
  strategyPath?: string;
  /** Model key for reflection. Defaults to MODEL_API_KEY / GEMINI_API_KEY in env. */
  modelApiKey?: string;
  /** Reflection model id. Defaults to gemini flash. */
  model?: string;
  /** Override the reflection step entirely (bring your own critic). */
  reflect?: (strategy: string, run: AgentRunResult) => Promise<string>;
  /** Progress sink. Defaults to console.error. */
  log?: (msg: string) => void;
}

export interface Attempt {
  iteration: number;
  passed: boolean;
  actions: number;
  message: string;
}

export interface ImproveResult {
  task: string;
  passed: boolean;
  iterations: number;
  /** The evolved strategy — the durable artifact this loop produces. */
  strategy: string;
  attempts: Attempt[];
}

/** Run the self-improving loop for one task. */
export async function improve(bot: Autopilot, task: Task, opts: ImproveOptions = {}): Promise<ImproveResult> {
  const maxIterations = opts.maxIterations ?? 5;
  const passesToWin = opts.passesToWin ?? 2;
  const maxSteps = opts.maxSteps ?? 12;
  const log = opts.log ?? ((m: string) => console.error(m));
  const modelApiKey =
    opts.modelApiKey ?? process.env.MODEL_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";

  let strategy = opts.initialStrategy ?? "(no strategy yet — explore the page and find the reliable path)";
  const attempts: Attempt[] = [];
  let streak = 0;

  for (let i = 1; i <= maxIterations; i++) {
    await bot.goto(task.url);
    const run = await bot.agent(`Objective: ${task.goal}\n\nFollow this learned strategy:\n${strategy}`, { maxSteps });

    const passed = await verify(bot, task);
    attempts.push({ iteration: i, passed, actions: run.actions?.length ?? 0, message: run.message ?? "" });
    log(`iter ${i}: ${passed ? "✅ PASS" : "❌ FAIL"} — ${run.actions?.length ?? 0} actions`);

    if (passed) {
      if (++streak >= passesToWin) {
        if (opts.strategyPath) writeFileSync(opts.strategyPath, strategyDoc(task, strategy));
        return { task: task.name, passed: true, iterations: i, strategy, attempts };
      }
      continue; // confirm it's reliably passing, not a fluke
    }

    streak = 0;
    strategy = opts.reflect
      ? await opts.reflect(strategy, run)
      : await defaultReflect({ goal: task.goal, strategy, run, modelApiKey, model: opts.model });
    log(`  ↳ revised strategy (${strategy.length} chars)`);
  }

  if (opts.strategyPath) writeFileSync(opts.strategyPath, strategyDoc(task, strategy));
  return { task: task.name, passed: false, iterations: maxIterations, strategy, attempts };
}

async function verify(bot: Autopilot, task: Task): Promise<boolean> {
  if (task.verify) {
    try {
      return await task.verify(bot);
    } catch {
      return false;
    }
  }
  if (task.successText) {
    try {
      const html: unknown = await bot.page.content();
      return typeof html === "string" && html.includes(task.successText);
    } catch {
      return false;
    }
  }
  // Fallback: ask the configured model to judge the page against the goal.
  try {
    const res = (await bot.extract({
      instruction: `Judge strictly whether this objective has been ACHIEVED on the current page: "${task.goal}".`,
      schema: z.object({ achieved: z.boolean(), evidence: z.string() }),
    })) as { achieved?: boolean };
    return !!res?.achieved;
  } catch {
    return false;
  }
}

async function defaultReflect(args: {
  goal: string;
  strategy: string;
  run: AgentRunResult;
  modelApiKey: string;
  model?: string;
}): Promise<string> {
  const { goal, strategy, run, modelApiKey, model } = args;
  if (!modelApiKey) return strategy; // no key → can't reflect; keep trying the same strategy
  const recent = (run.actions ?? []).slice(-12);
  const prompt = [
    "You are improving a browser-automation strategy that did NOT achieve its objective.",
    `Objective: ${goal}`,
    "",
    "Current strategy:",
    strategy,
    "",
    "What the agent just did (recent actions):",
    JSON.stringify(recent, null, 2),
    `Agent's final message: ${run.message ?? "(none)"}`,
    "",
    "Rewrite the strategy as a concise numbered checklist of imperative steps that fixes what went wrong.",
    "Be specific about the exact controls/labels the agent struggled with, any waits needed, and how to disambiguate.",
    "Output ONLY the new strategy text — no preamble.",
  ].join("\n");
  try {
    const out = await geminiComplete(prompt, { apiKey: modelApiKey, model });
    return out.trim() || strategy;
  } catch {
    return strategy; // reflection failed (rate limit, etc.) — keep the current strategy and retry
  }
}

function strategyDoc(task: Task, strategy: string): string {
  return [
    `# Strategy — ${task.name}`,
    "",
    `> Objective: ${task.goal}`,
    `> Target: ${task.url}`,
    "> Evolved by web-autopilot's self-improving loop.",
    "",
    strategy,
    "",
  ].join("\n");
}
