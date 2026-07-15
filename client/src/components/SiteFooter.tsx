import { useCallback, useState } from "react";
import { InfoModal, InfoTopic } from "../pages/InfoPages";

export function SiteFooter() {
  const [openTopic, setOpenTopic] = useState<InfoTopic | null>(null);
  const closeModal = useCallback(() => setOpenTopic(null), []);

  return (
    <>
      <footer className="site-footer">
        <div className="site-footer-mark">
          <span>Y5</span>
          <small>Independent basketball draft game</small>
        </div>
        <nav className="site-footer-nav" aria-label="Site information">
          <button type="button" onClick={() => setOpenTopic("about")}>About</button>
          <button type="button" onClick={() => setOpenTopic("privacy")}>Privacy</button>
          <button type="button" onClick={() => setOpenTopic("terms")}>Terms</button>
          <button type="button" onClick={() => setOpenTopic("contact")}>Contact</button>
        </nav>
        <div className="site-footer-note">&copy; 2026 Your Five</div>
      </footer>
      <InfoModal topic={openTopic} onClose={closeModal} />
    </>
  );
}
