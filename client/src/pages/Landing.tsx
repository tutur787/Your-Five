import { useNavigate } from "react-router-dom";
import { BrandLockup } from "../components/AppHeader";
import { OnboardingModal, useOnboarding } from "../components/OnboardingModal";

export function Landing() {
  const navigate = useNavigate();
  const onboarding = useOnboarding();

  return (
    <main className="home-screen">
      <header className="home-header">
        <BrandLockup />
        <button className="text-button" onClick={onboarding.show}>Rules</button>
      </header>

      <section className="home-intro">
        <div className="page-eyebrow">YOUR TEAM. YOUR CALL.</div>
        <h1>Every era. Twenty dollars. Your five.</h1>
        <div className="home-ticker" aria-label="Game format">
          <span><strong>5</strong> roster spots</span>
          <span><strong>$20</strong> hard cap</span>
          <span><strong>1</strong> skip</span>
        </div>
      </section>

      <section className="mode-select" aria-label="Choose a game mode">
        <button className="mode-option featured" onClick={() => navigate("/daily")}>
          <span className="mode-number">01</span>
          <span className="mode-copy">
            <span className="mode-label">Daily challenge</span>
            <span className="mode-meta">Today's board vs. the CPU</span>
          </span>
          <span className="mode-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button className="mode-option" onClick={() => navigate("/online")}>
          <span className="mode-number">02</span>
          <span className="mode-copy">
            <span className="mode-label">Play online</span>
            <span className="mode-meta">Random matchup or private room</span>
          </span>
          <span className="mode-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button className="mode-option" onClick={() => navigate("/local")}>
          <span className="mode-number">03</span>
          <span className="mode-copy">
            <span className="mode-label">Couch draft</span>
            <span className="mode-meta">Two GMs on one screen</span>
          </span>
          <span className="mode-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </section>

      <footer className="home-footer">ALL-TIME CARDS <span /> HEAD-TO-HEAD AUCTIONS <span /> LINEUP FIT</footer>
      <OnboardingModal open={onboarding.open} onClose={onboarding.close} />
    </main>
  );
}
