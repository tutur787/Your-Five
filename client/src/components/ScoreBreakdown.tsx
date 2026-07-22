import {
  accoladePoints,
  BasketballPlayerCard,
  PlayerAccolades,
  playerScoreContributions,
  positionPenaltyForSlot,
  normalizeFootballCompetition,
  rawStatTotal,
  RosterPick,
  scoreComponents,
  SoccerPlayerCard,
  soccerHonorDetails,
  soccerHonorPoints,
  soccerPlayerQuality,
  soccerScoreComponents,
  Sport,
  TeamState,
} from "@fiveaside/shared/core";
import { formatLineupSlot } from "../utils/position";

interface Props {
  team: TeamState;
  sport: Sport;
}

function formatAccolades(a: PlayerAccolades): string {
  const parts: string[] = [];
  if (a.mvp) parts.push(`${a.mvp}x MVP`);
  if (a.champion) parts.push(`${a.champion}x Champion`);
  if (a.dpoy) parts.push(`${a.dpoy}x DPOY`);
  if (a.allNba) parts.push(`${a.allNba}x All-NBA`);
  if (a.allDefense) parts.push(`${a.allDefense}x All-Defense`);
  return parts.join(", ");
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function PlayerScoreList({ team, sport }: Props) {
  const scores = new Map(playerScoreContributions(team, sport).map((score) => [score.playerId, score]));
  return (
    <>
      <div className="breakdown-heading">Player scores</div>
      <ul className="breakdown-list">
        {team.roster.map((pick) => {
          const score = scores.get(pick.player.id);
          if (!score) return null;
          return (
            <li className="player-contribution" key={pick.player.id}>
              <span>
                {pick.player.name} · {formatLineupSlot(pick.slot)}
                <small>
                  Core {score.core.toFixed(1)} · Team {signed(score.teamSuccess)} · Accolades +{score.awards.toFixed(1)} · Chemistry +{score.chemistry.toFixed(1)} · Fit {signed(score.fitShare)}{score.positionPenalty > 0 ? ` · Position -${score.positionPenalty.toFixed(1)}` : ""}
                </small>
              </span>
              <strong>{score.total.toFixed(1)}</strong>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Collapsible "why is my score what it is" breakdown — every ingredient behind the final score. */
export function ScoreBreakdown({ team, sport }: Props) {
  if (sport === "soccer") return <SoccerScoreBreakdown team={team} />;
  const raw = rawStatTotal(team);
  const components = scoreComponents(team);
  const isSingleSeason = team.roster.some(
    (pick) => pick.player.sport === "basketball" && pick.player.competition === "nba-2025-26"
  );
  const accoladedPicks = team.roster.filter(
    (p): p is typeof p & { player: BasketballPlayerCard } =>
      p.player.sport === "basketball" && Boolean(p.player.accolades) && accoladePoints(p.player.accolades) > 0
  );
  const wrongPicks = team.roster
    .map((pick) => ({ pick, penalty: positionPenaltyForSlot(pick.player, pick.slot) }))
    .filter(({ penalty }) => penalty > 0);

  return (
    <details className="score-breakdown-details">
      <summary>Score details ({components.total.toFixed(1)})</summary>
      <div className="score-breakdown-body">
        <PlayerScoreList team={team} sport={sport} />
        <div className="breakdown-heading">Core scoring</div>
        {!isSingleSeason && (
          <div className="breakdown-row">
            <span>Real stats (PPG+RPG+APG)</span>
            <span>{raw.toFixed(1)}</span>
          </div>
        )}
        <div className="breakdown-row">
          <span>{isSingleSeason ? "Offense (PPG+RPG+APG)" : "Era-adjusted offense"}</span>
          <span>{components.offense.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>{isSingleSeason ? "Defense (SPG+BPG)" : "Defense (SPG/BPG, era-adjusted)"}</span>
          <span>{components.defenseBox >= 0 ? "+" : ""}{components.defenseBox.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>Defensive Rating vs. league average</span>
          <span>{components.defRating >= 0 ? "+" : ""}{components.defRating.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>Plus-minus</span>
          <span>{components.plusMinus >= 0 ? "+" : ""}{components.plusMinus.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>Team success (win%)</span>
          <span>{components.teamSuccess >= 0 ? "+" : ""}{components.teamSuccess.toFixed(1)}</span>
        </div>
        {accoladedPicks.length > 0 && (
          <>
            <div className="breakdown-heading">Accolades (+{components.accolades.toFixed(1)})</div>
            <ul className="breakdown-list">
              {accoladedPicks.map((pick) => (
                <li key={pick.player.id}>
                  <span>{pick.player.name}</span>
                  <span>
                    {formatAccolades(pick.player.accolades!)} (+{accoladePoints(pick.player.accolades).toFixed(1)})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="breakdown-heading" style={{ color: components.fit.total >= 0 ? "var(--good)" : "var(--bad)" }}>
          Lineup fit ({components.fit.total >= 0 ? "+" : ""}
          {components.fit.total.toFixed(1)})
        </div>
        <ul className="breakdown-list">
          {components.fit.stackingPenalty > 0 && (
            <li>
              <span>{components.fit.alphaScorers} redundant high-usage scorers</span>
              <span>&minus;{components.fit.stackingPenalty.toFixed(1)}</span>
            </li>
          )}
          {components.fit.hasPlaymaking && (
            <li>
              <span>Real playmaking on the roster</span>
              <span>+bonus</span>
            </li>
          )}
          {components.fit.hasRimProtection && (
            <li>
              <span>Real rim protection on the roster</span>
              <span>+bonus</span>
            </li>
          )}
          {components.fit.stackingPenalty === 0 && !components.fit.hasPlaymaking && !components.fit.hasRimProtection && (
            <li>
              <span>No fit bonuses or penalties in effect</span>
              <span>0.0</span>
            </li>
          )}
        </ul>
        {components.chemistry.pairs.length > 0 && (
          <>
            <div className="breakdown-heading">Chemistry (+{components.chemistry.bonus.toFixed(1)})</div>
            <ul className="breakdown-list">
              {components.chemistry.pairs.map((pair) => (
                <li key={`${pair.a.player.id}-${pair.b.player.id}`}>
                  <span>
                    {pair.a.player.name} + {pair.b.player.name}
                  </span>
                  <span>real teammates</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {wrongPicks.length > 0 ? (
          <>
            <div className="breakdown-heading" style={{ color: "var(--bad)" }}>
              Wrong position (&minus;{components.wrongPositionPenalty})
            </div>
            <ul className="breakdown-list">
              {wrongPicks.map(({ pick, penalty }) => (
                <li key={pick.player.id}>
                  <span>{pick.player.name}</span>
                  <span>
                    sitting at {pick.slot} (&minus;{penalty})
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="breakdown-heading" style={{ color: "var(--good)" }}>
            Everyone's in position — no penalty
          </div>
        )}
        <div className="breakdown-row breakdown-total">
          <span>Final score</span>
          <span>{components.total.toFixed(1)}</span>
        </div>
      </div>
    </details>
  );
}

function SoccerScoreBreakdown({ team }: { team: TeamState }) {
  const components = soccerScoreComponents(team);
  const soccerPicks = team.roster.filter(
    (pick): pick is RosterPick & { player: SoccerPlayerCard } => pick.player.sport === "soccer"
  );
  const coreScores = soccerPicks.map((pick) => soccerPlayerQuality(pick.player));
  const honoredPicks = soccerPicks.filter((pick) => soccerHonorPoints(pick.player.honors) > 0);
  const isDomesticCompetition = soccerPicks.some(
    (pick) => normalizeFootballCompetition(pick.player.competition) !== "uefa-all-time"
  );
  return (
    <details className="score-breakdown-details">
      <summary>Score details ({components.total.toFixed(1)})</summary>
      <div className="score-breakdown-body">
        <PlayerScoreList team={team} sport="soccer" />
        <div className="breakdown-heading">Core scoring</div>
        <div className="breakdown-row"><span>Attack</span><span>{components.performance.attack.toFixed(1)}</span></div>
        <div className="breakdown-row"><span>Creation</span><span>{components.performance.creation.toFixed(1)}</span></div>
        <div className="breakdown-row"><span>Control</span><span>{components.performance.control.toFixed(1)}</span></div>
        <div className="breakdown-row"><span>Defense</span><span>{components.performance.defense.toFixed(1)}</span></div>
        <div className="breakdown-row"><span>Goalkeeping</span><span>{components.performance.goalkeeping.toFixed(1)}</span></div>
        <div className="breakdown-row"><span>Role-adjusted performance</span><span>{components.performance.total.toFixed(1)}</span></div>
        <div className="core-score-equation">
          {coreScores.map((score) => score.toFixed(1)).join(" + ")} = {components.performance.total.toFixed(1)}
        </div>
        <div className="breakdown-row">
          <span>{isDomesticCompetition ? "Team success (league PPM percentile)" : "Team success (60% weighted)"}</span>
          <span>{components.teamSuccess >= 0 ? "+" : ""}{components.teamSuccess.toFixed(1)}</span>
        </div>
        {honoredPicks.length > 0 ? (
          <>
            <div className="breakdown-heading">
              Accolades (+{components.honors.toFixed(1)}{components.honorsUncapped > components.honors ? ` of ${components.honorsUncapped.toFixed(1)}; capped` : ""})
            </div>
            <ul className="breakdown-list">
              {honoredPicks.map((pick) => (
                <li key={pick.player.id}>
                  <span>{pick.player.name}</span>
                  <span>
                    {soccerHonorDetails(pick.player.honors).map((honor) => `1x ${honor.label}`).join(", ")} (+{soccerHonorPoints(pick.player.honors)})
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="breakdown-heading" style={{ color: components.fit.total >= 0 ? "var(--good)" : "var(--bad)" }}>
          Lineup fit ({components.fit.total >= 0 ? "+" : ""}{components.fit.total.toFixed(1)})
        </div>
        <ul className="breakdown-list">
          <li><span>Creator</span><span>+{components.fit.creatorBonus}</span></li>
          <li><span>Defensive anchor</span><span>+{components.fit.defensiveAnchorBonus}</span></li>
          <li><span>Scorer</span><span>+{components.fit.scorerBonus}</span></li>
          <li><span>Goalkeeper security</span><span>+{components.fit.goalkeeperBonus}</span></li>
          {components.fit.stackingPenalty > 0 && <li><span>Attack-heavy redundancy</span><span>&minus;{components.fit.stackingPenalty}</span></li>}
        </ul>
        {components.chemistry.pairs.length > 0 && (
          <><div className="breakdown-heading">Chemistry (+{components.chemistry.bonus})</div>
          <ul className="breakdown-list">{components.chemistry.pairs.map((pair) => <li key={`${pair.a.player.id}-${pair.b.player.id}`}><span>{pair.a.player.name} + {pair.b.player.name}</span><span>real teammates</span></li>)}</ul></>
        )}
        {components.mismatches.length > 0 ? (
          <><div className="breakdown-heading" style={{ color: "var(--bad)" }}>Wrong position (&minus;{components.wrongPositionPenalty})</div>
          <ul className="breakdown-list">{components.mismatches.map(({ pick, penalty }) => <li key={pick.player.id}><span>{pick.player.name}</span><span>sitting at {formatLineupSlot(pick.slot)} (&minus;{penalty})</span></li>)}</ul></>
        ) : <div className="breakdown-heading" style={{ color: "var(--good)" }}>Everyone's in position - no penalty</div>}
        <div className="breakdown-row breakdown-total"><span>Final score</span><span>{components.total.toFixed(1)}</span></div>
      </div>
    </details>
  );
}
