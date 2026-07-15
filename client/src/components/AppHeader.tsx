import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup${compact ? " compact" : ""}`} aria-label="Your Five, the $20 all-time basketball draft">
      <img className="brand-logo" src="/favicon.svg" alt="" aria-hidden="true" />
      <span className="brand-name">YOUR FIVE</span>
      {!compact && <span className="brand-edition">$20 ALL-TIME DRAFT</span>}
    </div>
  );
}

export function AppHeader({
  eyebrow,
  title,
  detail,
  actions,
}: {
  eyebrow?: string;
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
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
      <div className="app-header-actions">{actions}</div>
    </header>
  );
}
