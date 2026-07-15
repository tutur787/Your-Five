import { useEffect, useRef, useState } from "react";
import { MatchState, POSITIONS, SeatId, teamScore } from "@fiveaside/shared";

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

function draw(ctx: CanvasRenderingContext2D, state: MatchState, seat: SeatId, label: string, subtitle?: string) {
  const team = state.teams[seat];
  const score = teamScore(team);

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 30px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("YOUR FIVE / $20 DRAFT", 36, 60);

  if (subtitle) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "18px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(subtitle, 36, 90);
  }

  ctx.fillStyle = COLORS.accent;
  ctx.font = "bold 22px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(label, 36, subtitle ? 132 : 110);

  const scoreY = subtitle ? 200 : 178;
  ctx.fillStyle = COLORS.accent2;
  ctx.font = "bold 56px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(score.toFixed(1), 36, scoreY);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "16px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("combined score", 36, scoreY + 26);

  let y = scoreY + 80;
  for (const pos of POSITIONS) {
    const pick = team.roster.find((p) => p.slot === pos);

    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(36, y - 32, CARD_WIDTH - 72, 60);

    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 18px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(pos, 56, y + 4);

    if (pick) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 22px -apple-system, Helvetica, Arial, sans-serif";
      ctx.fillText(pick.player.name, 116, y - 2);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "15px -apple-system, Helvetica, Arial, sans-serif";
      ctx.fillText(`${pick.player.era} · $${pick.price}`, 116, y + 20);
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
  const [status, setStatus] = useState<"idle" | "shared" | "downloaded" | "error">("idle");

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
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "My lineup on Your Five" });
          setStatus("shared");
          return;
        } catch {
          // user cancelled or share failed — fall back to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "your-five-result.png";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("downloaded");
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
        {status === "shared" ? "Shared!" : status === "downloaded" ? "Downloaded — share it!" : `Share ${label}'s team`}
      </button>
    </div>
  );
}
