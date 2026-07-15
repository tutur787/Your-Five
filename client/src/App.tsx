import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { SiteFooter } from "./components/SiteFooter";
import { DailyDraft } from "./pages/DailyDraft";
import { AboutPage, ContactPage, PrivacyPage, TermsPage } from "./pages/InfoPages";
import { Landing } from "./pages/Landing";
import { LocalDraft } from "./pages/LocalDraft";
import { OnlineLanding } from "./pages/OnlineLanding";
import { RoomPage } from "./pages/RoomPage";

export default function App() {
  const location = useLocation();

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/daily" element={<DailyDraft />} />
        <Route path="/local" element={<LocalDraft />} />
        <Route path="/online" element={<OnlineLanding />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
      <SiteFooter />
    </>
  );
}
