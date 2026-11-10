/** Forbidden sites and keywords are blurred in the lists until the user reveals them. */
export const shouldBlur = (forbidden, revealed) => forbidden === true && !revealed;

export const revealLabel = (revealed) => (revealed ? "Hide forbidden entries" : "Reveal forbidden entries");
