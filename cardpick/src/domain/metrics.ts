/** Gaps longer than this count as a break, capped at this length. */
export const ACTIVE_GAP_CAP_MS = 90_000;

/** Active working time from a series of tap timestamps. */
export function activeMs(taps: number[]): number {
  const t = [...taps].sort((a, b) => a - b);
  let ms = 0;
  for (let i = 1; i < t.length; i++) ms += Math.min(t[i]! - t[i - 1]!, ACTIVE_GAP_CAP_MS);
  return ms;
}

export function perHour(count: number, ms: number): number | null {
  if (ms <= 0 || count <= 1) return null;
  return (count / ms) * 3_600_000;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export interface ExperimentStats {
  cardsAudited: number;
  skusAudited: number;
  activeMs: number;
  cardsPerHour: number | null;
  discrepantSkus: number;
  discrepancyRate: number | null;
  unlistedSkus: number;
  sessions: number;
}

export interface Evaluation {
  headline: string;
  recommendation: string;
  details: string[];
}

/**
 * Turn audit-experiment numbers into a recommendation. Intentionally
 * conservative: deleting TCGplayer inventory is never recommended outright.
 */
export function evaluateExperiment(s: ExperimentStats, totalCards = 15500, target = 300): Evaluation {
  const details: string[] = [];
  if (s.cardsAudited < target) {
    return {
      headline: `${s.cardsAudited} / ${target} cards audited`,
      recommendation: 'Keep auditing. The evaluation is more reliable after ~300 cards across a few different sets.',
      details,
    };
  }
  const rate = s.discrepancyRate ?? 0;
  const pct = Math.round(rate * 1000) / 10;
  if (s.cardsPerHour) {
    const hours = totalCards / s.cardsPerHour;
    details.push(
      `At ${Math.round(s.cardsPerHour)} cards/hour, auditing ~${totalCards.toLocaleString()} cards would take about ${Math.round(hours)} active hours.`,
    );
  }
  details.push(`${s.discrepantSkus} of ${s.skusAudited} audited SKUs (${pct}%) disagreed with TCGplayer.`);
  if (s.unlistedSkus) details.push(`${s.unlistedSkus} audited SKUs were not listed on TCGplayer at all.`);

  let recommendation: string;
  if (rate < 0.05) {
    recommendation =
      'TCGplayer is mostly accurate. Correct progressively: keep auditing location by location and apply the recommended adjustments as you go.';
  } else if (rate < 0.2) {
    recommendation =
      'Moderate inaccuracy. Continue progressive correction, but audit whole sets at a time (and confirm absent cards) so each set becomes fully trustworthy before moving on. Start with your best-selling sets.';
  } else {
    recommendation =
      'TCGplayer is unreliable for the audited cards. Consider a controlled rebuild set by set: fully audit one set, then set its TCGplayer quantities from the verified counts, before moving to the next. Do not delete your whole TCGplayer inventory at once.';
  }
  if (s.cardsPerHour !== null && s.cardsPerHour < 150) {
    details.push('Audit speed is below ~150 cards/hour; look at the UX friction list before scaling up.');
  }
  return { headline: `Experiment complete: ${pct}% of audited SKUs had discrepancies`, recommendation, details };
}
