import { AppHeader } from "../components/AppHeader";
import { useLocalMatch } from "../hooks/useLocalMatch";
import { Draft } from "./Draft";

export function LocalDraft() {
  const { state, dispatch, error, reset } = useLocalMatch();
  return (
    <div className="game-page">
      <AppHeader
        eyebrow="LOCAL MATCH"
        title="Couch draft"
        detail="Pass the screen when possession changes"
        actions={<button className="secondary-button" onClick={reset}>Restart</button>}
      />
      <Draft state={state} dispatch={dispatch} error={error} mySeat="local" onRematch={reset} />
    </div>
  );
}
