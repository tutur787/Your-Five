import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-mark">
        <span>Y5</span>
        <small>Independent basketball draft game</small>
      </div>
      <nav className="site-footer-nav" aria-label="Site information">
        <Link to="/about">About</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/contact">Contact</Link>
      </nav>
      <div className="site-footer-note">&copy; 2026 Your Five</div>
    </footer>
  );
}
