import { createMatch } from "@fiveaside/shared";
import {
  aiRecordKey,
  dailyCompletedKey,
  loadAiDifficulty,
  loadAiRecord,
  loadDailyCompleted,
  recordAiResult,
  saveAiDifficulty,
  saveDailyResult,
} from "./aiStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let failures = 0;
function assert(condition: unknown, message: string) {
  if (condition) console.log(`ok: ${message}`);
  else { failures++; console.error(`FAIL: ${message}`); }
}

const storage = new MemoryStorage();
assert(loadAiDifficulty(storage) === "competitive", "AI difficulty defaults to Competitive");
saveAiDifficulty("expert", storage);
assert(loadAiDifficulty(storage) === "expert", "AI difficulty persists locally");

recordAiResult("basketball", "expert", "A", "A", storage);
recordAiResult("basketball", "expert", "B", "A", storage);
recordAiResult("basketball", "expert", "tie", "A", storage);
const record = loadAiRecord("basketball", "expert", storage);
assert(record.wins === 1 && record.losses === 1 && record.ties === 1, "Quick Draft stores wins, losses, and ties");
assert(loadAiRecord("soccer", "expert", storage).wins === 0, "AI records are separated by sport");
assert(loadAiRecord("basketball", "casual", storage).wins === 0, "AI records are separated by difficulty");
assert(storage.getItem(aiRecordKey("basketball", "expert")) !== null, "AI record uses the documented compatibility key");

const daily = createMatch("basketball", () => 0.2);
saveDailyResult("basketball", "2026-07-15", daily, "A", storage);
assert(loadDailyCompleted("basketball", "2026-07-15", storage) !== null, "Daily completion remains loadable");
assert(storage.getItem(dailyCompletedKey("basketball", "2026-07-15")) !== null, "Daily completion keeps its existing storage key");

if (failures > 0) {
  console.error(`\n${failures} AI storage test(s) failed.`);
  process.exit(1);
}
console.log("\nAll AI storage tests passed.");
