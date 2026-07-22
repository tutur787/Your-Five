import { ReactNode } from "react";
import { FaBasketball, FaFutbol } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { SportSwitch } from "./SportSwitch";
import { useSport } from "../hooks/useSport";
import { ProgressButton } from "./ProgressModal";
import { AccountButton } from "./AccountButton";

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  const { sport } = useSport();
  return (
    <div className={`brand-lockup${compact ? " compact" : ""}`} aria-label={`Your Five, the $20 ${sport === "soccer" ? "football" : "all-time basketball"} draft`}>
      <span className={`brand-logo sport-brand-logo ${sport}`} aria-hidden="true">
        {sport === "soccer" ? <FaFutbol /> : <FaBasketball />}
      </span>
      <span className="brand-name">YOUR FIVE</span>
      {!compact && <span className="brand-edition">$20 {sport === "soccer" ? "FOOTBALL" : "ALL-TIME BASKETBALL"} DRAFT</span>}
    </div>
  );
}

export function AppHeader({
  eyebrow,
  title,
  detail,
  actions,
  sportLocked = true,
}: {
  eyebrow?: string;
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
  sportLocked?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <button className="icon-button" onClick={() => navigate("/")} aria-label="Home" title="Home">
          <span aria-hidden="true">&larr;</span>
        </button>
        <BrandLockup compact />
      </div>
      <div className="app-header-context">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {detail && <div className="page-detail">{detail}</div>}
      </div>
      <div className="app-header-actions"><AccountButton /><ProgressButton /><SportSwitch disabled={sportLocked} />{actions}</div>
    </header>
  );
}
