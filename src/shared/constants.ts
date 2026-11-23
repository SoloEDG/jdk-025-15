export const DIRECT_BRANCH = "direct";
export const MAX_BRANCHES = 12;
/**
 * Hard ceiling on enumerated joint assignments. Real caps are far lower
 * because world storage is bounded in 32-bit words (see enumerateWorlds).
 */
export const MAX_WORLDS = 250_000;
/** Maximum number of cells a single merge may split on (2^n cases). */
export const MAX_CASES = 64;
