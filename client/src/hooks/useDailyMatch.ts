import { useAiMatch } from "./useAiMatch";
import type { SportRuntime } from "@fiveaside/shared/core";

export { AI_SEAT, HUMAN_SEAT } from "./useAiMatch";

export function useDailyMatch(runtime: SportRuntime) {
  return useAiMatch({ mode: "daily", difficulty: "competitive", runtime });
}
