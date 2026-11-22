import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/admin/settings";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * Is the assistant actually running?
 *
 * This replaces a hardcoded sentence — "Skonfigurowany — bot jeszcze nie
 * zbudowany" — which stayed on the settings page for weeks after the assistant
 * went live and started answering customers. That is the failure mode a status
 * line exists to prevent, and a written-in status can only ever describe the
 * day somebody typed it.
 *
 * So every word below comes from something checkable:
 *
 *   · `enabled` is the one switch. The widget is absent from the public page
 *     when it is off, and the API route answers 404 — both read the same flag.
 *   · the capability switches decide whether it can answer anything at all.
 *     All six off is a bot that loads and then refuses every question, which is
 *     worse than off and must not read as "active".
 *   · the conversation count is proof it is being used, not merely mounted.
 */

export type ChatbotState = "active" | "off" | "unavailable";

export type ChatbotStatus = {
  state: ChatbotState;
  /** "●" / "○" / "⚠" — a symbol, the same in both languages. */
  dot: string;
  label: Bilingual;
  /** One sentence of evidence for whatever the label claims. */
  detail: Bilingual;
  conversations7d: number;
  lastConversationAt: Date | null;
  /** Rules-only or rules-plus-model, and whether the kill switch is pulled. */
  mode: "deterministic" | "hybrid";
  aiPaused: boolean;
};

export async function getChatbotStatus(): Promise<ChatbotStatus> {
  const settings = await getSetting("chatbot");

  let conversations7d = 0;
  let lastAt: Date | null = null;
  try {
    const result = (await getDb().execute(sql`
      SELECT COUNT(*) FILTER (WHERE started_at >= now() - interval '7 days')::int AS n,
             MAX(last_message_at) AS last_at
        FROM chat_conversations
    `)) as unknown as { n: number; last_at: string | Date | null }[];
    const r = (Array.isArray(result) ? result : [])[0];
    conversations7d = Number(r?.n ?? 0) || 0;
    lastAt = r?.last_at ? new Date(r.last_at) : null;
  } catch {
    // Counting is a nicety; the switch is the fact. A database that cannot be
    // reached must not turn a running assistant into "wyłączony".
  }

  const mode = settings.mode === "hybrid" ? "hybrid" : "deterministic";
  const base = {
    conversations7d,
    lastConversationAt: lastAt,
    mode: mode as "deterministic" | "hybrid",
    aiPaused: Boolean(settings.aiPaused),
  };

  if (!settings.enabled) {
    return {
      ...base,
      state: "off",
      dot: "○",
      label: { pl: "Wyłączony", en: "Off" },
      detail: {
        pl: "Widget nie jest osadzony na stronie, a jego API odpowiada 404. Ten sam przełącznik zamyka obie połowy.",
        en: "The widget is not embedded on the site and its API answers 404. The same switch closes both halves.",
      },
    };
  }

  const can = settings.can as Record<string, boolean>;
  const anyCapability = Object.values(can).some(Boolean);
  if (!anyCapability) {
    return {
      ...base,
      state: "unavailable",
      dot: "⚠",
      label: { pl: "Niedostępny", en: "Unavailable" },
      detail: {
        pl: "Włączony, ale wszystkie funkcje są wyłączone — okno się otworzy i odmówi odpowiedzi na każde pytanie.",
        en: "Switched on, but every capability is off — the window opens and refuses to answer every question.",
      },
    };
  }

  const usagePl =
    conversations7d > 0
      ? `${conversations7d} ${conversations7d === 1 ? "rozmowa" : conversations7d < 5 ? "rozmowy" : "rozmów"} w ostatnich 7 dniach`
      : lastAt
        ? "bez rozmów w ostatnich 7 dniach"
        : "jeszcze bez żadnej rozmowy";
  const usageEn =
    conversations7d > 0
      ? `${conversations7d} ${conversations7d === 1 ? "conversation" : "conversations"} in the last 7 days`
      : lastAt
        ? "no conversations in the last 7 days"
        : "no conversations yet";

  const brainPl =
    mode === "hybrid"
      ? settings.aiPaused
        ? "reguły (model językowy wstrzymany przełącznikiem)"
        : "reguły + model językowy przy niepewnych zdaniach"
      : "same reguły";
  const brainEn =
    mode === "hybrid"
      ? settings.aiPaused
        ? "rules (language model paused by the switch)"
        : "rules + language model for uncertain sentences"
      : "rules only";

  return {
    ...base,
    state: "active",
    dot: "●",
    label: {
      pl: "Aktywny — chatbot działa na stronie",
      en: "Active — the chatbot is running on the site",
    },
    detail: {
      pl: `${usagePl}; ${brainPl}.`,
      en: `${usageEn}; ${brainEn}.`,
    },
  };
}
