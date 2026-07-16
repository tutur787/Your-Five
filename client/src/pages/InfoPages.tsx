import { ReactNode, useEffect, useRef } from "react";
import { AppHeader } from "../components/AppHeader";

const LAST_UPDATED = "July 16, 2026";
const REPOSITORY_URL = "https://github.com/tutur787/Your-Five";
const ISSUES_URL = `${REPOSITORY_URL}/issues/new`;
const PROFILE_URL = "https://github.com/tutur787";

export type InfoTopic = "about" | "privacy" | "terms" | "contact";

function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Your Five`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <div className="game-page info-page">
      <AppHeader eyebrow={eyebrow} title={title} detail={`Last updated ${LAST_UPDATED}`} />
      <article className="info-document">
        <p className="info-lede">{intro}</p>
        {children}
      </article>
    </div>
  );
}

export function AboutPage() {
  return (
    <InfoPage
      eyebrow="THE PROJECT"
      title="About Your Five"
      intro="Your Five is an independent basketball and football drafting game built around a simple question: what lineup would you create with a hard cap and another GM bidding against you?"
    >
      <section className="info-section">
        <span className="info-section-number">01</span>
        <div>
          <h2>The game</h2>
          <p>
            Players from different eras enter the auction one at a time. Each side manages the same budget,
            fills five lineup positions, and makes tradeoffs between star power, value, and positional fit.
            Daily, local, private-room, and random online modes use the same underlying draft rules.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Design principles</h2>
          <p>
            The project is designed to be quick to understand, competitive without being pay-to-win, and
            respectful of basketball and football history. The court, pitch, and scoring systems are game mechanics, not claims
            about how any real team or player would perform.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Data and independence</h2>
          <p>
            Historical season statistics were compiled using NBA.com data accessed through the open-source
            <code> nba_api</code> client. Position references were checked against Wikipedia, and the classic-team
            pool references listings published by 2K Ratings.
          </p>
          <p>
            Football cards use the official <a href="https://www.uefa.com/news/01f9-0e7b894d6108-cf92003088c7-1000--uefa-com-users-team-of-the-year-2011-revealed/" target="_blank" rel="noreferrer">UEFA.com Fans' Teams of the Year</a> from 2001 through 2020,
            followed by <a href="https://www.uefa.com/uefachampionsleague/news/0269-12688c451cdd-b6efcb4ce948-1000--squad-of-the-season/" target="_blank" rel="noreferrer">UEFA Technical Observer selections</a> from the 2020/21 Champions League onward.
            Roles come directly from those selections. Card statistics are generated from the corresponding
            UEFA club-competition match records, with the source selection and match IDs retained in the project database.
          </p>
          <p className="info-muted">
            Your Five is an independent fan-made project. It is not affiliated with, endorsed by, or sponsored
            by the NBA, WNBA, FIFA, UEFA, CAF, any football association, league, club, national team, their players, Take-Two Interactive, 2K, Wikipedia, or Sports Reference.
            No league or team logos are used.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}

export function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="YOUR DATA"
      title="Privacy Policy"
      intro="Your Five is playable without an account. This policy explains the limited information used to run the game and where it is stored."
    >
      <section className="info-section">
        <span className="info-section-number">01</span>
        <div>
          <h2>Information stored on your device</h2>
          <p>Your browser may store:</p>
          <ul>
            <li>whether you have already seen the rules introduction;</li>
            <li>your selected basketball or soccer mode preference;</li>
            <li>your selected AI difficulty and local win-loss-tie records;</li>
            <li>daily challenge completion data and your best daily score; and</li>
            <li>a temporary private-room seat token in session storage so you can reconnect during that browser session.</li>
          </ul>
          <p>You can remove this information using your browser's site-data controls.</p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Online matches</h2>
          <p>
            Online play sends room identifiers, random seat tokens, draft actions, and game state to the Your Five
            Cloudflare Worker. Room information is used only to coordinate the match. Inactive room data is scheduled
            for deletion approximately one hour after all players disconnect.
          </p>
          <p>
            Your Five does not currently request your name, email address, precise location, contacts, payment
            information, or social-media account.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Hosting and service data</h2>
          <p>
            Cloudflare hosts the website and online game service. Like most hosting providers, Cloudflare may process
            technical data such as IP addresses, request metadata, device or browser details, security events, and
            diagnostic logs to deliver and protect the service. Its handling of that data is governed by the
            {" "}<a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare Privacy Policy</a>.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">04</span>
        <div>
          <h2>Advertising and sharing</h2>
          <p>
            Your Five uses Google AdSense to verify the site and, after approval, display advertising. Google and its
            advertising partners may use cookies or similar technologies and process information such as IP address,
            device and browser details, viewed pages, and ad interactions to provide, measure, and personalize ads,
            depending on your region and consent choices. Learn more in Google's
            {" "}<a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer">Advertising Policies</a>
            {" "}and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
          </p>
          <p>
            Your Five does not sell personal information and does not currently use third-party analytics. Where
            required, advertising consent choices will be presented before personalized advertising is enabled.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">05</span>
        <div>
          <h2>Children and your choices</h2>
          <p>
            The service is not directed to children under 13. You may play without providing identifying information,
            clear locally stored data through your browser, and close an online room at any time by leaving the page.
          </p>
          <p>
            For a privacy question or request, use the private contact options listed on the
            {" "}<a href={PROFILE_URL} target="_blank" rel="noreferrer">project maintainer's GitHub profile</a>.
            Do not include private information in a public issue.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}

export function TermsPage() {
  return (
    <InfoPage
      eyebrow="HOUSE RULES"
      title="Terms of Use"
      intro="By accessing or playing Your Five, you agree to these terms. If you do not agree, do not use the service."
    >
      <section className="info-section">
        <span className="info-section-number">01</span>
        <div>
          <h2>Entertainment only</h2>
          <p>
            Your Five is a fictional strategy game. Scores, prices, lineups, and outcomes are game mechanics and
            should not be treated as professional rankings, financial advice, betting information, or predictions.
            In-game dollars have no cash value and cannot be purchased, redeemed, or transferred.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>interfere with matchmaking, rooms, other players, or service availability;</li>
            <li>use bots, automation, or exploits to gain an unfair advantage or create excessive traffic;</li>
            <li>attempt to access another player's private room token or non-public service data;</li>
            <li>use the service for unlawful, abusive, fraudulent, or infringing activity; or</li>
            <li>misrepresent an affiliation between Your Five and any league, team, player, or company.</li>
          </ul>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Ownership and third-party references</h2>
          <p>
            The Your Five name, original interface, game presentation, and original software are owned by their
            respective project owner or contributors. Player names, historical facts, company names,
            league names, and other third-party references remain associated with their respective owners. Their use
            does not imply sponsorship or endorsement.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">04</span>
        <div>
          <h2>Availability and changes</h2>
          <p>
            The service is provided on an "as is" and "as available" basis. Features, player pools, scoring, and
            availability may change or be discontinued. Access may be limited when necessary to protect the service,
            other players, or legal rights.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">05</span>
        <div>
          <h2>Disclaimer and liability</h2>
          <p>
            To the maximum extent permitted by law, no warranties are made regarding uninterrupted operation,
            accuracy, fitness for a particular purpose, or error-free play. The project owner and contributors will
            not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of
            the service. Rights that cannot legally be excluded remain unaffected.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">06</span>
        <div>
          <h2>Updates and contact</h2>
          <p>
            These terms may be revised as the service changes. The date above identifies the latest version. Questions,
            rights concerns, or reports can be submitted through the <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">project repository</a>.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}

export function ContactPage() {
  return (
    <InfoPage
      eyebrow="GET IN TOUCH"
      title="Contact"
      intro="Bug reports, product ideas, rights questions, and responsible security reports are welcome. Choose the channel that fits the message."
    >
      <section className="contact-directory" aria-label="Contact options">
        <a className="contact-row" href={ISSUES_URL} target="_blank" rel="noreferrer">
          <span className="info-section-number">01</span>
          <span>
            <strong>Bug or gameplay issue</strong>
            <small>Open a GitHub issue with the page, device, and steps that caused it.</small>
          </span>
          <span aria-hidden="true">&rarr;</span>
        </a>
        <a className="contact-row" href={ISSUES_URL} target="_blank" rel="noreferrer">
          <span className="info-section-number">02</span>
          <span>
            <strong>Feedback or feature idea</strong>
            <small>Share an improvement or discuss how the game should evolve.</small>
          </span>
          <span aria-hidden="true">&rarr;</span>
        </a>
        <a className="contact-row" href={PROFILE_URL} target="_blank" rel="noreferrer">
          <span className="info-section-number">03</span>
          <span>
            <strong>Privacy, security, or rights concern</strong>
            <small>Use a private contact method listed on the maintainer profile.</small>
          </span>
          <span aria-hidden="true">&rarr;</span>
        </a>
      </section>
      <p className="contact-caution">
        Public GitHub issues are visible to everyone. Never post passwords, room tokens, private correspondence,
        personal information, or details that would make a security issue easier to exploit.
      </p>
    </InfoPage>
  );
}

const INFO_CONTENT: Record<InfoTopic, () => JSX.Element> = {
  about: AboutPage,
  privacy: PrivacyPage,
  terms: TermsPage,
  contact: ContactPage,
};

const INFO_LABELS: Record<InfoTopic, string> = {
  about: "About Your Five",
  privacy: "Privacy Policy",
  terms: "Terms of Use",
  contact: "Contact",
};

export function InfoModal({ topic, onClose }: { topic: InfoTopic | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!topic) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
      previouslyFocused?.focus();
    };
  }, [onClose, topic]);

  if (!topic) return null;

  const Content = INFO_CONTENT[topic];
  return (
    <div className="modal-backdrop info-modal-backdrop" onClick={onClose}>
      <section
        className="modal info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={INFO_LABELS[topic]}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="icon-button modal-close info-modal-close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          &times;
        </button>
        <div className="info-modal-scroll">
          <Content />
        </div>
      </section>
    </div>
  );
}
