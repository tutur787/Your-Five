import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSport } from "../hooks/useSport";

const SITE_URL = "https://your-five.com";
const ADSENSE_CLIENT = "ca-pub-2828213825609013";

const PAGE_METADATA: Record<string, { title: string; description: string; ads?: boolean }> = {
  "/about": {
    title: "About Your Five | Your Five",
    description: "Learn why Your Five was built and how its basketball and football auction drafts work.",
    ads: true,
  },
  "/how-to-play": {
    title: "How to Play Your Five | Draft Rules",
    description: "Learn the auction, budget, skip, placement, and lineup rules for Your Five basketball and football drafts.",
    ads: true,
  },
  "/scoring": {
    title: "How Your Five Scoring Works",
    description: "See how player performance, achievements, chemistry, tactical fit, and position penalties decide a Your Five matchup.",
    ads: true,
  },
  "/data-sources": {
    title: "Player Data Sources | Your Five",
    description: "See the source and verification methodology behind the basketball and football player cards in Your Five.",
    ads: true,
  },
  "/privacy": {
    title: "Privacy Policy | Your Five",
    description: "Read how Your Five handles local game data, online rooms, analytics, and advertising.",
  },
  "/terms": {
    title: "Terms of Use | Your Five",
    description: "Read the rules and conditions for using the Your Five basketball and football draft game.",
  },
  "/contact": {
    title: "Contact | Your Five",
    description: "Report a bug, suggest an improvement, or contact the Your Five project maintainer.",
  },
};

function setMeta(selector: string, content: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
}

export function SeoMetadata() {
  const { pathname } = useLocation();
  const { sport } = useSport();

  useEffect(() => {
    const page = PAGE_METADATA[pathname];
    const sportName = sport === "soccer" ? "Football" : "Basketball";
    const title = page?.title ?? `Your Five | ${sportName} Draft`;
    const description = page?.description ?? (
      sport === "soccer"
        ? "Draft legendary football players, outbid your opponent, and build your five with a $20 cap."
        : "Draft legendary basketball players, outbid your opponent, and build your five with a $20 cap."
    );
    const canonicalPath = page || pathname === "/" ? pathname : "/";
    const canonicalUrl = `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`;
    const indexable = pathname === "/" || Boolean(page);

    document.title = title;
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="robots"]', indexable ? "index, follow" : "noindex, nofollow");
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
  }, [pathname, sport]);

  useEffect(() => {
    const contentPage = Boolean(PAGE_METADATA[pathname]?.ads);
    document.body.classList.toggle("google-anno-skip", !contentPage);

    if (!contentPage || document.querySelector("#your-five-adsense")) return;
    const script = document.createElement("script");
    script.id = "your-five-adsense";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    document.head.appendChild(script);

    return () => script.remove();
  }, [pathname]);

  return null;
}
