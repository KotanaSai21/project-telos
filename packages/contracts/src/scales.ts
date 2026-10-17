/**
 * Ordered scales used by the policy engine.
 *
 * Types come from the generated contracts, so an element that is not a valid
 * contract value fails to compile. Completeness against the schema enums is
 * asserted in tests.
 */
import type { Intensity } from './generated/consent-profile.js';
import type { Action } from './generated/decision.js';

/** Ordered least to most intense. A boundary admits content at or below its threshold. */
export const INTENSITY_ORDER = [
  'none',
  'mild',
  'suggestive',
  'strong',
  'explicit',
] as const satisfies readonly Intensity[];

/** Ordered least to most restrictive. Selection always prefers the earliest viable entry. */
export const ACTION_ORDER = [
  'allow',
  'soften',
  'summarize',
  'reframe',
  'replace',
  'hold',
  'quarantine',
] as const satisfies readonly Action[];

export function intensityRank(value: Intensity): number {
  return INTENSITY_ORDER.indexOf(value);
}

export function actionRank(value: Action): number {
  return ACTION_ORDER.indexOf(value);
}

/** True when observed intensity exceeds what the profile admits for that category. */
export function exceedsThreshold(observed: Intensity, threshold: Intensity): boolean {
  return intensityRank(observed) > intensityRank(threshold);
}

/** The least restrictive of the candidates. Empty input means nothing to restrict. */
export function leastRestrictive(candidates: readonly Action[]): Action {
  if (candidates.length === 0) return 'allow';
  return [...candidates].sort((a, b) => actionRank(a) - actionRank(b))[0]!;
}

/** The most restrictive of the candidates, used when several boundaries match at once. */
export function mostRestrictive(candidates: readonly Action[]): Action {
  if (candidates.length === 0) return 'allow';
  return [...candidates].sort((a, b) => actionRank(b) - actionRank(a))[0]!;
}
