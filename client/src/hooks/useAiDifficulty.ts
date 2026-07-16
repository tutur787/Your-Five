import { useCallback, useState } from "react";
import { AiDifficulty } from "@fiveaside/shared";
import { loadAiDifficulty, saveAiDifficulty } from "../utils/aiStorage";

export function useAiDifficulty() {
  const [difficulty, setDifficultyState] = useState<AiDifficulty>(loadAiDifficulty);
  const setDifficulty = useCallback((next: AiDifficulty) => {
    setDifficultyState(next);
    saveAiDifficulty(next);
  }, []);
  return { difficulty, setDifficulty };
}
