/** Lets one call through per cooldown window, so one blocked page does not fire many shutdown requests. */
export function createCooldownGate(cooldownMs, now = Date.now) {
  let lastPassed = -Infinity;
  return {
    tryPass() {
      const time = now();
      if (time - lastPassed < cooldownMs) return false;
      lastPassed = time;
      return true;
    },
  };
}
