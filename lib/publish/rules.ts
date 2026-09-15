import { canUseAutoMode, type PlanTier, type PublishMode } from "@/lib/plans/entitlements";

/**
 * The auto-within-rules rule set (002 T3.3, US5, decisions §4) — a fixed, small
 * set of gates, not a rule graph.
 *
 * The database enforces the same gates in enqueue_auto_publish_job()
 * (migration 0013) and has the final say. This pure mirror exists so the rules
 * are testable without a database and the UI can explain why something did or
 * did not auto-publish. Change both together.
 */

export const AUTO_RULE_ID = "auto_within_rules";
export const DEFAULT_MIN_CONFIDENCE = 60;

export type AutoSettings = {
  plan: PlanTier;
  publishMode: PublishMode;
  autoEnabled: boolean;
  timezone: string;
  /** "HH:MM" or "HH:MM:SS", workspace-local. */
  windowStart: string;
  windowEnd: string;
  /** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** Null means the optional confidence gate is off (the default). */
  minConfidence: number | null;
};

export type AutoCandidate = {
  targetType: string;
  accountActive: boolean;
  accountAutoEnabled: boolean;
  hasApprovedClaims: boolean;
  forbiddenViolations: string[];
  /** Confidence of the linked strategy idea, if any. */
  ideaConfidence: number | null;
};

export type AutoDecision =
  | { publish: true }
  | { publish: false; reason: string; routeToReview: boolean };

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** The workspace-local ISO weekday and minute of day for an instant. */
export function localClock(now: Date, timeZone: string): { isoDay: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    isoDay: WEEKDAYS[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Start inclusive, end exclusive, in the workspace timezone. */
export function withinWindow(settings: Pick<AutoSettings, "timezone" | "windowStart" | "windowEnd" | "days">, now: Date): boolean {
  const { isoDay, minutes } = localClock(now, settings.timezone);
  return (
    settings.days.includes(isoDay) &&
    minutes >= toMinutes(settings.windowStart) &&
    minutes < toMinutes(settings.windowEnd)
  );
}

export function evaluateAutoRules(settings: AutoSettings, candidate: AutoCandidate, now: Date): AutoDecision {
  const hold = (reason: string): AutoDecision => ({ publish: false, reason, routeToReview: false });

  if (settings.publishMode !== "auto_within_rules") return hold("the workspace is not in auto_within_rules mode");
  if (!canUseAutoMode(settings.plan)) return hold(`auto publishing is not included in the ${settings.plan} plan`);
  if (!settings.autoEnabled) return hold("the master auto toggle is off");
  if (candidate.targetType !== "content_draft") return hold("only content drafts auto-publish");
  if (!candidate.accountActive) return hold("the target account is not connected or its token is invalid");
  if (!candidate.accountAutoEnabled) return hold("the target account is not enabled for auto publishing");
  if (!candidate.hasApprovedClaims) return hold("the workspace has no approved claims");

  // US5 AC2: a violation is never silently held — a human is asked to look.
  if (candidate.forbiddenViolations.length > 0) {
    return {
      publish: false,
      reason: `the body contains forbidden claims: ${candidate.forbiddenViolations.join(", ")}`,
      routeToReview: true,
    };
  }

  if (!withinWindow(settings, now)) return hold("outside the auto publishing window");

  if (settings.minConfidence !== null) {
    if (candidate.ideaConfidence === null || candidate.ideaConfidence < settings.minConfidence) {
      return hold(`the linked idea's confidence is below ${settings.minConfidence}`);
    }
  }

  return { publish: true };
}
