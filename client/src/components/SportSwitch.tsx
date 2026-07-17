import { CSSProperties, KeyboardEvent, PointerEvent, useRef, useState } from "react";
import { FaBasketball, FaFutbol } from "react-icons/fa6";
import { useSport } from "../hooks/useSport";

export function SportSwitch({ disabled = false }: { disabled?: boolean }) {
  const { sport, setSport } = useSport();
  const trackRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const progressFromPointer = (clientX: number) => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds) return sport === "soccer" ? 1 : 0;
    return Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  };

  const commitProgress = (progress: number) => {
    setSport(progress >= 0.5 ? "soccer" : "basketball");
    setDragProgress(null);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragProgress(progressFromPointer(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    setDragProgress(progressFromPointer(event.clientX));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    const progress = progressFromPointer(event.clientX);
    activePointerRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commitProgress(progress);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    setDragProgress(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "ArrowLeft" || event.key === "Home") {
      event.preventDefault();
      setSport("basketball");
    } else if (event.key === "ArrowRight" || event.key === "End") {
      event.preventDefault();
      setSport("soccer");
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setSport(sport === "basketball" ? "soccer" : "basketball");
    }
  };

  const progress = dragProgress ?? (sport === "soccer" ? 1 : 0);
  const switchStyle = { "--sport-switch-progress": progress } as CSSProperties;

  return (
    <div
      className={`sport-switch${disabled ? " disabled" : ""}`}
      role="group"
      aria-label="Choose sport"
      title={disabled ? "Return home to change sports" : undefined}
    >
      <button
        type="button"
        className={`sport-option${sport === "basketball" ? " active" : ""}`}
        disabled={disabled}
        onClick={() => setSport("basketball")}
        aria-pressed={sport === "basketball"}
      >
        <FaBasketball aria-hidden="true" /><span>Basketball</span>
      </button>
      <div
        ref={trackRef}
        className={`sport-toggle-track${dragProgress !== null ? " dragging" : ""}`}
        role="switch"
        tabIndex={disabled ? -1 : 0}
        aria-label="Switch between basketball and football"
        aria-checked={sport === "soccer"}
        aria-disabled={disabled}
        style={switchStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
      >
        <span className="sport-toggle-thumb" aria-hidden="true">
          {progress >= 0.5 ? <FaFutbol /> : <FaBasketball />}
        </span>
      </div>
      <button
        type="button"
        className={`sport-option${sport === "soccer" ? " active" : ""}`}
        disabled={disabled}
        onClick={() => setSport("soccer")}
        aria-pressed={sport === "soccer"}
      >
        <FaFutbol aria-hidden="true" /><span>Football</span>
      </button>
    </div>
  );
}
