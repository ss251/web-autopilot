/**
 * Minimal, dependency-free model completion — used by the self-improving loop to
 * reflect on a failed run and rewrite the strategy. Defaults to Google Gemini
 * (the same provider Stagehand uses by default), via plain `fetch`, so there's
 * no extra SDK to install. Swap it out by passing your own `reflect` to improve().
 */

export interface CompleteOptions {
  apiKey: string;
  /** Stagehand-style id ("google/gemini-2.5-flash") or a bare Gemini id; default flash. */
  model?: string;
}

/** One-shot text completion against the Google Generative Language API. */
export async function geminiComplete(prompt: string, opts: CompleteOptions): Promise<string> {
  const model = (opts.model ?? "google/gemini-2.5-flash").replace(/^google\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}
