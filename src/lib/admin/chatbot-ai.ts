import "server-only";
import { getDb } from "@/lib/db";
import { getSetting } from "./settings";
import { usageToday, nextResetUtc, DAILY_NEURON_CAP } from "@/lib/chat/ai/budget";
import { configFromEnv, DEFAULT_MODEL } from "@/lib/chat/ai/cloudflare";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * What the admin panel is allowed to know about the AI layer.
 *
 * Deliberately a whitelist of computed facts rather than a dump of
 * configuration. There is no field here that could carry `CF_AI_TOKEN` or
 * `CF_ACCOUNT_ID`, and `configured` is a boolean — the panel learns THAT
 * credentials exist, never what they are. A page cannot leak a value it was
 * never given.
 */

/** Same test the settings module uses: no connection string, no database. */
const usingDb = () => Boolean(process.env.DATABASE_URL);

export type AiStatus = "ACTIVE" | "PAUSED" | "UNAVAILABLE";

export type ChatbotAiPanel = {
  /** Which engine is selected. */
  mode: "deterministic" | "hybrid";
  status: AiStatus;
  /** Why the status is what it is, in words an operator can act on. */
  explanation: Bilingual;
  /** True when both credentials are present. Never the values. */
  configured: boolean;
  /** The model id — public information, not a secret. */
  model: string;
  neuronsToday: number;
  neuronCap: number;
  callsToday: number;
  fallbacksToday: number;
  /** ISO timestamp of the next 00:00 UTC. */
  resetsAt: string;
};

export async function getChatbotAiPanel(now = new Date()): Promise<ChatbotAiPanel> {
  const chatbot = await getSetting("chatbot");
  const configured = configFromEnv() !== null;

  const usage = usingDb()
    ? await usageToday(getDb())
    : {
        day: now.toISOString().slice(0, 10),
        neurons: 0,
        calls: 0,
        fallbacks: 0,
        cap: DAILY_NEURON_CAP,
        remaining: DAILY_NEURON_CAP,
      };

  /**
   * Three states, and the order they are decided in matters.
   *
   * "Paused" must beat "unavailable": an operator who pulled the switch should
   * see that the switch is what stopped it, not a vaguer message about missing
   * credentials that would send them hunting for the wrong problem.
   */
  let status: AiStatus;
  let explanation: Bilingual;
  if (chatbot.mode !== "hybrid") {
    status = "PAUSED";
    explanation = {
      pl: "Tryb deterministyczny — model nie jest pytany.",
      en: "Deterministic mode — the model is not consulted.",
    };
  } else if (chatbot.aiPaused) {
    status = "PAUSED";
    explanation = {
      pl: "Zatrzymane ręcznie przełącznikiem awaryjnym.",
      en: "Stopped manually by the emergency switch.",
    };
  } else if (!configured) {
    status = "UNAVAILABLE";
    explanation = {
      pl: "Brak poświadczeń Cloudflare — chatbot działa na regułach.",
      en: "No Cloudflare credentials — the chatbot runs on rules.",
    };
  } else if (usage.remaining <= 0) {
    status = "UNAVAILABLE";
    explanation = {
      pl: "Dzienny limit wyczerpany — wraca po północy UTC.",
      en: "Daily limit used up — it returns after midnight UTC.",
    };
  } else {
    status = "ACTIVE";
    explanation = {
      pl: "Model odpowiada na pytania, których reguły nie rozstrzygają.",
      en: "The model answers questions that the rules do not settle.",
    };
  }

  return {
    mode: chatbot.mode,
    status,
    explanation,
    configured,
    model: process.env.CF_AI_MODEL || DEFAULT_MODEL,
    neuronsToday: usage.neurons,
    neuronCap: usage.cap,
    callsToday: usage.calls,
    fallbacksToday: usage.fallbacks,
    resetsAt: nextResetUtc(now).toISOString(),
  };
}
