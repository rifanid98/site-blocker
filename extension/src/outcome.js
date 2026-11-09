import { shouldShutDown } from "./matcher.js";

/**
 * Whether a blocked page first gets the "unlocking" countdown screen.
 * A page that is going to shut the PC down (forbidden match + shutdown mode on) skips it and acts immediately.
 */
export function shouldCountDown({ reason, shutdown, unlock }) {
  if (reason === null || reason === undefined || !unlock.enabled) return false;

  const goesStraightToShutdown = shouldShutDown(reason) && shutdown.enabled;
  return !goesStraightToShutdown;
}
