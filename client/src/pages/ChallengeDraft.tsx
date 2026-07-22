import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { competitionForPoolVersion, competitionLabel, Sport, SportRuntime, teamScore } from "@fiveaside/shared/core";
import { AppHeader } from "../components/AppHeader";
import { useAiMatch } from "../hooks/useAiMatch";
import { useSport } from "../hooks/useSport";
import { Draft } from "./Draft";
import { RuntimeLoading, useSportRuntime } from "../hooks/useSportRuntime";

function isSport(value: string | undefined): value is Sport {
  return value === "basketball" || value === "soccer";
}

export function ChallengeDraft() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { setSport } = useSport();
  const sport = isSport(params.sport) ? params.sport : null;
  const seed = params.seed ?? "";
  const version = params.version ?? "";
  const targetValue = Number(searchParams.get("target"));
  const target = Number.isFinite(targetValue) && targetValue >= 0 && targetValue <= 999.9 ? targetValue : 0;
  const competition = sport ? competitionForPoolVersion(sport, version) : null;
  const valid = Boolean(sport && seed && competition);

  useEffect(() => {
    if (sport) setSport(sport);
  }, [sport, setSport]);

  if (!valid || !sport) {
    return (
      <div className="game-page">
        <AppHeader eyebrow="CHALLENGE" title="Challenge expired" detail="This link used an older or unsupported player pool." />
        <section className="challenge-expired">
          <p>Start a fresh draft with the current player database.</p>
          <button className="primary" onClick={() => navigate("/ai/quick")}>Start a new draft</button>
        </section>
      </div>
    );
  }

  return <ChallengeRuntimeGate sport={sport} seed={seed} target={target} competition={competition ?? undefined} />;
}

function ChallengeRuntimeGate({ sport, seed, target, competition }: { sport: Sport; seed: string; target: number; competition?: Parameters<typeof useSportRuntime>[1] }) {
  const runtime = useSportRuntime(sport, competition, `challenge:${seed}`);
  if (!runtime) return <RuntimeLoading />;
  return <ActiveChallenge sport={sport} seed={seed} target={target} runtime={runtime} />;
}

function ActiveChallenge({ sport, seed, target, runtime }: { sport: Sport; seed: string; target: number; runtime: SportRuntime }) {
  const { state, dispatch, error, reset, humanSeat } = useAiMatch({
    mode: "challenge",
    difficulty: "competitive",
    sportOverride: sport,
    challengeSeed: seed,
    targetScore: target,
    runtime,
  });
  const score = teamScore(state.teams[humanSeat], sport);
  const completed = state.phase === "complete";

  return (
    <div className="game-page">
      <AppHeader
        eyebrow="SCORE CHALLENGE"
        title={`Beat ${target.toFixed(1)}`}
        detail={`Same pool · Competitive AI · ${competitionLabel(runtime.sport, runtime.competition)}`}
        actions={<button className="secondary-button" onClick={reset}>Restart</button>}
      />
      {completed && (
        <div className={score > target ? "notice-banner challenge-won" : "notice-banner"}>
          {score > target ? `Target beaten by ${(score - target).toFixed(1)} points.` : `${(target - score).toFixed(1)} points short of the target.`}
        </div>
      )}
      <Draft
        state={state}
        dispatch={dispatch}
        error={error}
        mySeat={humanSeat}
        seatNames={{ A: "You", B: "Competitive AI" }}
        onRematch={reset}
        resultsSubtitle={`Score Challenge · Target ${target.toFixed(1)} · ${competitionLabel(runtime.sport, runtime.competition)}`}
      />
    </div>
  );
}
