import {
  accoladePoints,
  PlayerAccolades,
  positionPenaltyForSlot,
  rawStatTotal,
  scoreComponents,
  TeamState,
} from "@fiveaside/shared";

interface Props {
  team: TeamState;
  defaultOpen?: boolean;
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

/** Collapsible "why is my score what it is" breakdown — every ingredient behind the final score. */
export function ScoreBreakdown({ team, defaultOpen }: Props) {
  const raw = rawStatTotal(team);
  const components = scoreComponents(team);
  const accoladedPicks = team.roster.filter((p) => p.player.accolades && accoladePoints(p.player.accolades) > 0);
  const wrongPicks = team.roster
    .map((pick) => ({ pick, penalty: positionPenaltyForSlot(pick.player, pick.slot) }))
    .filter(({ penalty }) => penalty > 0);

  return (
    <details className="score-breakdown-details" open={defaultOpen}>
      <summary>Score details ({components.total.toFixed(1)})</summary>
      <div className="score-breakdown-body">
        <div className="breakdown-row">
          <span>Real stats (PPG+RPG+APG)</span>
          <span>{raw.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>Era-adjusted offense</span>
          <span>{components.offense.toFixed(1)}</span>
        </div>
        <div className="breakdown-row">
          <span>Defense (SPG/BPG, era-adjusted)</span>
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
