import { useEffect, useState } from "react";
import { useSport } from "../hooks/useSport";

const SEEN_KEY = "fiveaside-has-seen-onboarding";

/** Tracks whether the first-visit "How to play" modal should show automatically. */
export function useOnboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setOpen(true);
        localStorage.setItem(SEEN_KEY, "1");
      }
    } catch {
      setOpen(true);
    }
  }, []);

  return { open, show: () => setOpen(true), close: () => setOpen(false) };
}

export function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sport } = useSport();
  const soccer = sport === "soccer";
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div><div className="page-eyebrow">GAME RULES</div><h2>Build Your Five.</h2></div>
          <button className="icon-button modal-close" onClick={onClose} aria-label="Close" title="Close">&times;</button>
        </div>
        <ul className="how-to-play">
          <li>
            <span>01</span><div><strong>$20 budget</strong>{soccer ? "Fill GK, two DEF spots, MID, and ATT." : "Draft one player at PG, SG, SF, PF, and C."}</div>
          </li>
          <li>
            <span>02</span><div><strong>Balanced reveals</strong>{soccer ? "Each pool has 3 GK, 6 DEF, 4 MID, and 5 ATT primary cards." : "Each pool has 3 primary cards at every position."} The order stays hidden.</div>
          </li>
          <li>
            <span>03</span><div><strong>Bid or fold</strong>Raise the price or let the other GM take the card at their bid.</div>
          </li>
          <li>
            <span>04</span><div><strong>Escalating skips</strong>Your first skip is free. The next three cost $1, $5, then $10.</div>
          </li>
          <li>
            <span>05</span><div><strong>Lineup matters</strong>Rearrange freely. Playing out of position carries a realistic penalty.</div>
          </li>
          <li>
            <span>06</span><div><strong>Highest score wins</strong>{soccer ? "Performance, team success, honors, chemistry, tactics, and positioning decide the match." : "Stats, accolades, chemistry, fit, and positioning decide the matchup."}</div>
          </li>
        </ul>
        <div className="action-row">
          <button className="primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
