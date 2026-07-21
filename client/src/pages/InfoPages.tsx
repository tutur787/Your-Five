import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { AppHeader } from "../components/AppHeader";

const LAST_UPDATED = "July 21, 2026";
const REPOSITORY_URL = "https://github.com/tutur787/Your-Five";
const ISSUES_URL = `${REPOSITORY_URL}/issues/new`;
const PROFILE_URL = "https://github.com/tutur787";

export type InfoTopic = "about" | "privacy" | "terms" | "contact";

const InfoModalContext = createContext(false);

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
  const inModal = useContext(InfoModalContext);

  return (
    <div className="game-page info-page">
      {!inModal && <AppHeader eyebrow={eyebrow} title={title} detail={`Last updated ${LAST_UPDATED}`} />}
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

export function HowToPlayPage() {
  return (
    <InfoPage
      eyebrow="DRAFT MANUAL"
      title="How to Play"
      intro="Your Five is a head-to-head auction. Both GMs begin with $20, compete for a shared stream of players, and try to finish with the stronger five-player lineup."
    >
      <section className="info-section">
        <span className="info-section-number">01</span>
        <div>
          <h2>Choose a draft</h2>
          <p>
            Quick Draft plays against an AI at your chosen difficulty. The Daily Challenge gives everyone the same
            seeded player pool. Online play matches you with another person or creates a private room for a friend.
            Couch Draft lets two GMs share one device. Basketball and football use the same auction rules but have
            separate players, formations, visuals, and scoring systems.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Manage the $20 cap</h2>
          <p>
            A revealed player starts an auction. The GM on the clock opens the bidding, and the two sides may raise
            until one concedes. The winner pays the final bid. The maximum legal bid always reserves $1 for every
            other empty roster spot, so a team can still complete its five.
          </p>
          <div className="formula-block"><code>maximum bid = money left - open roster spots + 1</code></div>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Use skips carefully</h2>
          <p>
            Each team follows the same skip ladder: the first skip is free, then later skips cost $1, $5, and $10.
            A skipped player is normally offered to the other GM for $1 before leaving the draft. Paid skips are
            allowed only when enough money remains to fill every open slot. The escalating price makes passing on a
            poor fit possible without making endless rerolls the best strategy.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">04</span>
        <div>
          <h2>Build the formation</h2>
          <p>
            Basketball lineups fill PG, SG, SF, PF, and C. Football lineups fill GK, DEF, MID, and two ATT spots.
            When a new player is won, the game first offers any open sourced position. If every sourced position is
            occupied, the player may enter any open slot. You can later drag, tap, or use the keyboard to swap any
            two players, even when the move creates a position penalty.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">05</span>
        <div>
          <h2>Finish and compare</h2>
          <p>
            The draft ends when both teams have five players. The winner is determined by the selected sport's
            scoring model, not by money spent or money left. Expand Score details after the game to see every card,
            bonus, chemistry pair, tactical adjustment, and position penalty that produced the result.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}

export function ScoringPage() {
  return (
    <InfoPage
      eyebrow="UNDER THE HOOD"
      title="Scoring Explained"
      intro="Every result comes from a deterministic formula. The same lineup always receives the same score, and the post-game breakdown exposes each ingredient used by the engine."
    >
      <section className="info-section">
        <span className="info-section-number">01</span>
        <div>
          <h2>Basketball score</h2>
          <p>
            Each card contributes era-adjusted points, rebounds, assists, steals, and blocks. Where sourced data is
            available, the model also adds defensive rating versus league average, plus-minus, and team win
            percentage. Verified MVPs, championships, Defensive Player of the Year awards, All-NBA selections, and
            All-Defense selections add explicit accolade points.
          </p>
          <div className="formula-block"><code>score = player production + team success + accolades + fit + chemistry - position penalties</code></div>
          <p>
            Fit rewards a real playmaker and rim protector, while more than two high-usage scorers creates a
            redundancy penalty. Verified former NBA teammates add chemistry. A wrong position is penalized by the
            basketball distance between the player's sourced positions and the lineup slot, so PF to C is less
            costly than C to PG.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Football card quality</h2>
          <p>
            Every football card has a 0-20 role-adjusted quality score. The observed edition score ranks verified
            UEFA match metrics against cards with the same role. Goalkeepers use save percentage, goals conceded,
            clean sheets, claims, and passing. Defenders emphasize tackles, recoveries, clearances, passing, and
            progression. Midfielders emphasize creation, progression, passing, recovery, dribbling, and scoring.
            Attackers emphasize non-penalty goals, shots on target, assists, dribbling, accuracy, and progression.
          </p>
          <p>
            Short competition windows can be noisy, so the observed edition score is blended with verified UEFA
            selection pedigree. Edition confidence increases with minutes, metric coverage, and alignment between
            the card's selection period and its scoring window. Goalkeeper confidence is deliberately reduced
            because keeper outcomes contain fewer independent actions and depend more heavily on the team defense.
          </p>
          <div className="formula-block"><code>card quality = edition score x confidence + UEFA pedigree x (1 - confidence)</code></div>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Football team score</h2>
          <p>
            The five card-quality ratings form the base. A small team-success adjustment compares points per match
            and goal difference in the card's scoring window. Verified honors then add 3 points for winning the
            relevant UEFA competition, 5 for one major individual award, 2 for top scorer, 2 for a positional award,
            and 1 for Young Player of the Season. Honors are capped at 20 points per lineup.
          </p>
          <p>
            Tactical fit can reward a creator, defensive anchor, scorer, and secure goalkeeper, while too many
            attack-dominant players can reduce the bonus. Same-edition club teammates add 2 points per pair, capped
            at 6. Position penalties are 5 between MID and ATT, 6 between DEF and MID, 16 between DEF and ATT, and
            30 between GK and any outfield role.
          </p>
          <div className="formula-block"><code>score = five card qualities + team success + honors + tactical fit + chemistry - mismatches</code></div>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">04</span>
        <div>
          <h2>What the score is not</h2>
          <p>
            The score is a game model, not a definitive historical ranking or a prediction of a real match. Auction
            value is also separate from final quality: a cheap star may be a great draft outcome, but the price itself
            does not increase that player's score. The full breakdown is shown so close results can be inspected
            rather than treated as a hidden judgment.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}

export function DataSourcesPage() {
  return (
    <InfoPage
      eyebrow="PROVENANCE"
      title="Data Sources"
      intro="Your Five uses committed player databases built from named public sources. Production games do not invent missing statistics or make live requests to third-party sports sites."
    >
      <section className="info-section">
        <span className="info-section-number">01</span>
        <div>
          <h2>Basketball cards</h2>
          <p>
            Historical season statistics come from NBA.com data accessed through the open-source
            <code> nba_api</code> client. The displayed per-game numbers remain the sourced values; era factors affect
            scoring calculations rather than rewriting the statistics shown on a card. Player positions are sourced
            from published position listings and stored explicitly, without assigning positions from statistical
            rules. Historical teammates and honors are stored as verified card metadata.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Football selection pool</h2>
          <p>
            The database contains 298 cards from 26 official UEFA selections. It uses UEFA.com Fans' Team of the Year
            selections from 2001 through 2020 and UEFA Champions League Squad or Team of the Season selections from
            2020/21 onward. The role attached to a card comes from its official selection rather than an inferred
            statistical profile.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Football match data</h2>
          <p>
            Football statistics are generated from UEFA public club-competition match records for the card's exact
            scoring window. The generator retains canonical player IDs, team IDs, source position labels, source
            selection URLs, honor URLs, and every contributing match ID in a provenance manifest. Optional metrics
            are used only when their tracked coverage passes the configured threshold, and generation fails on
            missing matches, duplicate cards, unsupported roles, or non-finite values.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">04</span>
        <div>
          <h2>Verified honors</h2>
          <p>
            Football honors are attached only when an official source connects the award to the exact card year or
            season. The ledger covers relevant UEFA competition wins, UEFA overall player awards, Ballon d'Or,
            Champions League top scorer, UEFA positional awards, and Champions League Young Player of the Season.
            Multiple major individual awards on one card share a single 5-point major-award contribution so the same
            achievement level is not counted twice.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">05</span>
        <div>
          <h2>Independence and corrections</h2>
          <p>
            Your Five is an independent fan-made game and is not endorsed by any player, team, league, federation,
            ratings publisher, or data provider mentioned on the site. Third-party names and facts identify their
            subjects and sources. A suspected data error can be reported through the Contact page with the card,
            edition, and supporting source so it can be checked against the committed provenance.
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
            <li>your selected basketball or football mode preference;</li>
            <li>your selected AI difficulty and local win-loss-tie records;</li>
            <li>daily challenge completion data and your best daily score; and</li>
            <li>your optional online nickname, recent draft history, streaks, mode records, achievements, and challenge results;</li>
            <li>a random anonymous client identifier used to apply basic room-creation and matchmaking rate limits; and</li>
            <li>a temporary private-room seat token in session storage so you can reconnect during that browser session.</li>
          </ul>
          <p>You can remove this information using your browser's site-data controls.</p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">02</span>
        <div>
          <h2>Optional Google account</h2>
          <p>
            You may continue as a guest or sign in with Google. When you sign in, Google provides a stable account
            identifier, your email address, and your Google profile name. Your Five stores those values, your chosen
            display name, account creation time, revocable session records, and your synced game progress and achievements in Cloudflare
            Durable Objects. Your Five does not receive or store your Google password and does not retain Google's access token.
            Google's handling of sign-in information is governed by the
            {" "}<a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
          </p>
          <p>
            A secure, HttpOnly session cookie keeps you signed in for up to 30 days. Your current device record is imported
            when the account is first created. Later completed drafts are merged by match ID to avoid counting the same game twice.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">03</span>
        <div>
          <h2>Online matches</h2>
          <p>
            Online play sends room identifiers, random seat tokens, draft actions, and game state to the Your Five
            Cloudflare Worker. If you choose a nickname, it is shared with the other player and retained only with that room.
            Room information is used only to coordinate the match. Inactive room data is scheduled
            for deletion approximately one hour after all players disconnect.
          </p>
          <p>Online play does not require an account. Your Five does not request precise location, contacts, or payment information.</p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">04</span>
        <div>
          <h2>Hosting and service data</h2>
          <p>
            Cloudflare hosts the website and online game service. Like most hosting providers, Cloudflare may process
            technical data such as IP addresses, request metadata, device or browser details, security events, and
            diagnostic logs to deliver and protect the service. Its handling of that data is governed by the
            {" "}<a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare Privacy Policy</a>.
          </p>
          <p>
            Your Five may use Cloudflare Web Analytics to understand aggregate page views, visits, and website
            performance. Cloudflare describes this service as privacy-first and states that Web Analytics does not
            collect or use visitors' personal data. Analytics is kept separate from Your Five account profiles.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">05</span>
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
            Your Five does not sell personal information. Where required, advertising consent choices will be
            presented before personalized advertising is enabled.
          </p>
        </div>
      </section>
      <section className="info-section">
        <span className="info-section-number">06</span>
        <div>
          <h2>Children and your choices</h2>
          <p>
            The service is not directed to children under 13. You may play without an account, clear locally stored data
            through your browser, sign out from the account panel, or permanently delete the account and its cloud record.
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
            <li>use an abusive, threatening, discriminatory, impersonating, or otherwise inappropriate online nickname;</li>
            <li>create an account for another person, misrepresent your identity, or attempt to access another account;</li>
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
  about: "About",
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
        <header className="info-modal-header">
          <h2>{INFO_LABELS[topic]}</h2>
        </header>
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
          <InfoModalContext.Provider value>
            <Content />
          </InfoModalContext.Provider>
        </div>
      </section>
    </div>
  );
}
