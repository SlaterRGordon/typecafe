import { z } from "zod";

// Very short unranked runs can legitimately produce four-digit WPM. Keep a
// generous abuse bound without rejecting values the result card already shows.
export const SHARE_WPM_MAX = 10_000;
export const shareWpmSchema = z.number().finite().nonnegative().max(SHARE_WPM_MAX);
