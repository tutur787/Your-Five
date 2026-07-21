import { Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { SiteFooter } from "./components/SiteFooter";
import { SeoMetadata } from "./components/SeoMetadata";
import {
  AboutPage,
  ContactPage,
  DataSourcesPage,
  HowToPlayPage,
  PrivacyPage,
  ScoringPage,
  TermsPage,
} from "./pages/InfoPages";
import { SportProvider } from "./hooks/useSport";
import { AchievementToast } from "./components/ProgressModal";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { lazyRoute } from "./utils/lazyRoute";

const Landing = lazyRoute(() => import("./pages/Landing").then((module) => ({ default: module.Landing })));
const AiLanding = lazyRoute(() => import("./pages/AiLanding").then((module) => ({ default: module.AiLanding })));
const DailyDraft = lazyRoute(() => import("./pages/DailyDraft").then((module) => ({ default: module.DailyDraft })));
const LocalDraft = lazyRoute(() => import("./pages/LocalDraft").then((module) => ({ default: module.LocalDraft })));
const OnlineLanding = lazyRoute(() => import("./pages/OnlineLanding").then((module) => ({ default: module.OnlineLanding })));
const QuickAiDraft = lazyRoute(() => import("./pages/QuickAiDraft").then((module) => ({ default: module.QuickAiDraft })));
const RoomPage = lazyRoute(() => import("./pages/RoomPage").then((module) => ({ default: module.RoomPage })));
const ChallengeDraft = lazyRoute(() => import("./pages/ChallengeDraft").then((module) => ({ default: module.ChallengeDraft })));

export default function App() {
  const location = useLocation();

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <SportProvider>
      <SeoMetadata />
      <AchievementToast />
      <RouteErrorBoundary key={location.pathname}>
        <Suspense fallback={<div className="route-loading"><span className="search-pulse" /> Loading Your Five</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/ai" element={<AiLanding />} />
            <Route path="/ai/quick" element={<QuickAiDraft />} />
            <Route path="/daily" element={<DailyDraft />} />
            <Route path="/local" element={<LocalDraft />} />
            <Route path="/online" element={<OnlineLanding />} />
            <Route path="/room/:code" element={<RoomPage />} />
            <Route path="/challenge/:sport/:version/:seed" element={<ChallengeDraft />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/how-to-play" element={<HowToPlayPage />} />
            <Route path="/scoring" element={<ScoringPage />} />
            <Route path="/data-sources" element={<DataSourcesPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
      <SiteFooter />
    </SportProvider>
  );
}
