import { useEffect, useRef, useState } from "react";
import { competitionLabel, MatchState, playerScoreContributions, SeatId, slotsForSport, teamScore } from "@fiveaside/shared/core";
import { formatLineupSlot } from "../utils/position";

interface Props {
  state: MatchState;
  seat: SeatId;
  label: string;
  subtitle?: string;
}

const CARD_WIDTH = 640;
const CARD_HEIGHT = 760;

const COLORS = {
  bg: "#0d0f11",
  panel: "#171a1e",
  text: "#f5f1e8",
  muted: "#9ca3aa",
  accent: "#e87532",
  accent2: "#f0b35a",
  good: "#8fd14f",
};

function fittedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function draw(ctx: CanvasRenderingContext2D, state: MatchState, seat: SeatId, label: string, subtitle?: string) {
  const team = state.teams[seat];
  const score = teamScore(team, state.sport);
  const playerScores = new Map(playerScoreContributions(team, state.sport).map((value) => [value.playerId, value]));

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 30px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`YOUR FIVE / $20 ${state.sport === "soccer" ? "FOOTBALL" : "BASKETBALL"} DRAFT`, 36, 60);

  const poolLabel = competitionLabel(state.sport, state.competition);
  const resolvedSubtitle = [
    subtitle,
    poolLabel && !subtitle?.includes(poolLabel) ? poolLabel : null,
  ].filter(Boolean).join(" · ");
  if (resolvedSubtitle) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "18px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(fittedText(ctx, resolvedSubtitle, CARD_WIDTH - 72), 36, 90);
  }

  ctx.fillStyle = COLORS.accent;
  ctx.font = "bold 22px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(label, 36, resolvedSubtitle ? 132 : 110);

  const scoreY = resolvedSubtitle ? 200 : 178;
  ctx.fillStyle = COLORS.accent2;
  ctx.font = "bold 56px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(score.toFixed(1), 36, scoreY);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "16px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("combined score", 36, scoreY + 26);

  let y = scoreY + 80;
  for (const pos of slotsForSport(state.sport)) {
    const pick = team.roster.find((p) => p.slot === pos);

    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(36, y - 32, CARD_WIDTH - 72, 60);

    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 18px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(formatLineupSlot(pos), 56, y + 4);

    if (pick) {
      const playerScore = playerScores.get(pick.player.id);
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 22px -apple-system, Helvetica, Arial, sans-serif";
      ctx.fillText(fittedText(ctx, pick.player.name, 370), 116, y - 2);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "15px -apple-system, Helvetica, Arial, sans-serif";
      ctx.fillText(fittedText(ctx, `${pick.player.era} · $${pick.price}`, 370), 116, y + 20);
      if (playerScore) {
        ctx.textAlign = "right";
        ctx.fillStyle = COLORS.accent2;
        ctx.font = "bold 22px -apple-system, Helvetica, Arial, sans-serif";
        ctx.fillText(playerScore.total.toFixed(1), CARD_WIDTH - 56, y - 1);
        ctx.fillStyle = COLORS.muted;
        ctx.font = "bold 10px -apple-system, Helvetica, Arial, sans-serif";
        ctx.fillText("SCORE", CARD_WIDTH - 56, y + 18);
        ctx.textAlign = "left";
      }
    } else {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "italic 18px -apple-system, Helvetica, Arial, sans-serif";
      ctx.fillText("Empty", 116, y + 4);
    }
    y += 76;
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = "14px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("OUTBID THEM · BUILD YOUR FIVE", 36, CARD_HEIGHT - 24);
}

export function ShareCard({ state, seat, label, subtitle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"idle" | "shared" | "downloaded" | "copied" | "error">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    draw(ctx, state, seat, label, subtitle);
  }, [state, seat, label, subtitle]);

  const handleShare = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setStatus("error");
        return;
      }
      const file = new File([blob], "your-five-result.png", { type: "image/png" });
      const score = teamScore(state.teams[seat], state.sport);
      const challengeUrl = state.poolSeed && state.poolVersion
        ? `${window.location.origin}/challenge/${state.sport}/${encodeURIComponent(state.poolVersion)}/${encodeURIComponent(state.poolSeed)}?target=${score.toFixed(1)}`
        : null;
      const shareText = challengeUrl
        ? `I scored ${score.toFixed(1)} in Your Five. Can you beat my five?`
        : `My ${state.sport} lineup on Your Five.`;
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "My lineup on Your Five", text: shareText, url: challengeUrl ?? undefined });
          setStatus("shared");
          return;
        } catch {
          // Fall through to a link share or clipboard/download fallback.
        }
      }
      if (nav.share && challengeUrl) {
        try {
          await nav.share({ title: "Can you beat my five?", text: shareText, url: challengeUrl });
          setStatus("shared");
          return;
        } catch {
          // Fall through to clipboard/download.
        }
      }
      if (challengeUrl) {
        try {
          await navigator.clipboard.writeText(`${shareText} ${challengeUrl}`);
          setStatus("copied");
        } catch {
          setStatus("downloaded");
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "your-five-result.png";
      a.click();
      URL.revokeObjectURL(url);
      if (!challengeUrl) setStatus("downloaded");
    }, "image/png");
  };

  return (
    <div className="share-card">
      <canvas
        ref={canvasRef}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        className="share-card-canvas"
        aria-label={`${label}'s draft result card`}
      />
      <button className="primary" onClick={handleShare}>
        {status === "shared"
          ? "Shared!"
          : status === "copied"
            ? "Challenge copied"
            : status === "downloaded"
              ? "Downloaded — share it!"
              : `Share ${label}'s team`}
      </button>
    </div>
  );
}
