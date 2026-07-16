import { useAiMatch } from "./useAiMatch";

export { AI_SEAT, HUMAN_SEAT } from "./useAiMatch";

export function useDailyMatch() {
  return useAiMatch({ mode: "daily", difficulty: "competitive" });
}
