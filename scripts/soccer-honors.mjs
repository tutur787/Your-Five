const UEFA_CLUB_AWARDS_SOURCE =
  "https://www.uefa.com/uefasupercup/news/0250-0c50f41f3c36-73a920d50345-1000--uefa-club-football-awards/";
const UEFA_MENS_PLAYER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0254-0e99d68ce583-a9362a08b3eb-1000--who-has-won-the-uefa-men-s-player-of-the-year-award/";
const UEFA_2020_AWARDS_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0265-113a7215fcd9-2afc8d8b5eaa-1000--roll-of-honour-2020/";
const UEFA_2021_PLAYER_SOURCE =
  "https://www.uefa.com/news-media/news/026c-1317c5d44053-673457b2aa24-1000--jorginho-wins-uefa-men-s-player-of-the-year-award/";
const UCL_PLAYER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/029a-1de593cb29ee-c04434a97ebb-1000--ousmane-dembele-named-2024-25-/";
const UCL_2026_PLAYER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/02a5-20c1d7bf915e-f9e703cf0108-1000--khvicha-kvaratskhelia-named-2025-26-uefa-champions-league-/";
const UCL_TOP_SCORERS_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0257-0e910cf2494a-5185150de9d4-1000--champions-league-all-time-top-scorers/";
const UCL_BUFFON_GOALKEEPER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/023c-0e9c93367b5f-6e0561d03889-1000--gianluigi-buffon-named-ucl-goalkeeper-of-the-season/";
const UCL_ALISSON_GOALKEEPER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0254-0e99ddf91387-ab770f0011fc-1000--alisson-becker-champions-league-goalkeeper-of-the-season/";
const UCL_NEUER_GOALKEEPER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0262-1081c44e5dd8-5362b6f7f741-1000--manuel-neuer-champions-league-goalkeeper-of-the-season/";
const UCL_MENDY_GOALKEEPER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/026c-1317b1d16759-056f2e78eadd-1000--goalkeeper-of-the-season-mendy/";
const BALLON_DOR_SOURCE = "https://ballondor.com/all-rankings";
const UCL_2017_POSITIONAL_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0253-0d8217b17e39-8255d1a1708a-1000--buffon-ramos-modric-and-ronaldo-win-positional-awards/";
const UCL_2018_POSITIONAL_SOURCE =
  "https://www.uefa.com/news-media/news/0248-0f8e632e3872-4a03015cc96d-1000--pernille-harder-and-luka-modric-win-uefa-player-of-the-year-awards/";
const UCL_2019_POSITIONAL_SOURCE =
  "https://www.uefa.com/uefaeuropaleague/news/0254-0e99e1e83f55-704bd90eeab5-1000--eden-hazard-named-europa-league-player-of-the-season/";
const UCL_2021_AWARDS_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/0270-1416c2af1371-a3c983f42d4e-1000--roll-of-honour-2021/";
const UCL_YOUNG_PLAYER_SOURCE =
  "https://www.uefa.com/uefachampionsleague/news/029a-1de593e81763-a1312db28c5a-1000--desire-doue-named-2024-25-uefa-champions-league-young-player-of-the-season/";

const bestPlayer = (edition, player, label, sourceUrl) => ({
  edition,
  player,
  kind: "bestPlayer",
  label,
  sourceUrl,
});
const topScorer = (edition, player, goals, joint = false) => ({
  edition,
  player,
  kind: "topScorer",
  label: `UEFA Champions League ${joint ? "joint " : ""}top scorer (${goals} goals)`,
  sourceUrl: UCL_TOP_SCORERS_SOURCE,
});
const positionalAward = (edition, player, position, sourceUrl) => ({
  edition,
  player,
  kind: "positionalAward",
  label: position === "Club Goalkeeper"
    ? "UEFA Club Goalkeeper of the Year"
    : `UEFA Champions League ${position} of the Season`,
  sourceUrl,
});
const ballonDor = (edition, player) => ({
  edition,
  player,
  kind: "ballonDor",
  label: "Ballon d'Or",
  sourceUrl: BALLON_DOR_SOURCE,
});
const youngPlayer = (edition, player) => ({
  edition,
  player,
  kind: "youngPlayer",
  label: "UEFA Champions League Young Player of the Season",
  sourceUrl: UCL_YOUNG_PLAYER_SOURCE,
});

// Every entry is tied to the exact selection year/season used by that card.
// A winner absent from the corresponding UEFA selection is intentionally omitted.
export const SOCCER_OFFICIAL_HONORS = [
  bestPlayer("TOTY2002", "Zinédine Zidane", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2003", "Gianluigi Buffon", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2005", "Steven Gerrard", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2006", "Ronaldinho", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2007", "Kaká", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2008", "Cristiano Ronaldo", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2009", "Lionel Messi", "UEFA Club Footballer of the Year", UEFA_CLUB_AWARDS_SOURCE),
  bestPlayer("TOTY2011", "Lionel Messi", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2012", "Andrés Iniesta", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2013", "Franck Ribéry", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2014", "Cristiano Ronaldo", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2015", "Lionel Messi", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2016", "Cristiano Ronaldo", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2017", "Cristiano Ronaldo", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2018", "Luka Modrić", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2019", "Virgil van Dijk", "UEFA Men's Player of the Year", UEFA_MENS_PLAYER_SOURCE),
  bestPlayer("TOTY2020", "Robert Lewandowski", "UEFA Men's Player of the Year", UEFA_2020_AWARDS_SOURCE),
  bestPlayer("UCL2021", "Jorginho", "UEFA Men's Player of the Year", UEFA_2021_PLAYER_SOURCE),
  bestPlayer("UCL2022", "Karim Benzema", "UEFA Champions League Player of the Season", UCL_PLAYER_SOURCE),
  bestPlayer("UCL2023", "Rodri", "UEFA Champions League Player of the Season", UCL_PLAYER_SOURCE),
  bestPlayer("UCL2024", "Vinícius Júnior", "UEFA Champions League Player of the Season", UCL_PLAYER_SOURCE),
  bestPlayer("UCL2025", "Ousmane Dembélé", "UEFA Champions League Player of the Season", UCL_PLAYER_SOURCE),
  bestPlayer("UCL2026", "Khvicha Kvaratskhelia", "UEFA Champions League Player of the Season", UCL_2026_PLAYER_SOURCE),

  topScorer("TOTY2003", "Ruud van Nistelrooy", 12),
  topScorer("TOTY2007", "Kaká", 10),
  topScorer("TOTY2008", "Cristiano Ronaldo", 8),
  topScorer("TOTY2009", "Lionel Messi", 9),
  topScorer("TOTY2010", "Lionel Messi", 8),
  topScorer("TOTY2011", "Lionel Messi", 12),
  topScorer("TOTY2012", "Lionel Messi", 14),
  topScorer("TOTY2013", "Cristiano Ronaldo", 12),
  topScorer("TOTY2014", "Cristiano Ronaldo", 17),
  topScorer("TOTY2015", "Lionel Messi", 10, true),
  topScorer("TOTY2015", "Neymar", 10, true),
  topScorer("TOTY2015", "Cristiano Ronaldo", 10, true),
  topScorer("TOTY2016", "Cristiano Ronaldo", 16),
  topScorer("TOTY2017", "Cristiano Ronaldo", 12),
  topScorer("TOTY2018", "Cristiano Ronaldo", 15),
  topScorer("TOTY2019", "Lionel Messi", 12),
  topScorer("TOTY2020", "Robert Lewandowski", 15),
  topScorer("UCL2021", "Erling Haaland", 10),
  topScorer("UCL2022", "Karim Benzema", 15),
  topScorer("UCL2023", "Erling Haaland", 12),
  topScorer("UCL2024", "Harry Kane", 8, true),
  topScorer("UCL2025", "Raphinha", 13, true),

  positionalAward("TOTY2003", "Gianluigi Buffon", "Club Goalkeeper", UEFA_CLUB_AWARDS_SOURCE),
  positionalAward("TOTY2005", "Petr Čech", "Club Goalkeeper", UEFA_CLUB_AWARDS_SOURCE),

  positionalAward("TOTY2017", "Gianluigi Buffon", "Goalkeeper", UCL_BUFFON_GOALKEEPER_SOURCE),
  positionalAward("TOTY2017", "Sergio Ramos", "Defender", UCL_2017_POSITIONAL_SOURCE),
  positionalAward("TOTY2017", "Luka Modrić", "Midfielder", UCL_2017_POSITIONAL_SOURCE),
  positionalAward("TOTY2017", "Cristiano Ronaldo", "Forward", UCL_2017_POSITIONAL_SOURCE),
  positionalAward("TOTY2018", "Sergio Ramos", "Defender", UCL_2018_POSITIONAL_SOURCE),
  positionalAward("TOTY2018", "Luka Modrić", "Midfielder", UCL_2018_POSITIONAL_SOURCE),
  positionalAward("TOTY2018", "Cristiano Ronaldo", "Forward", UCL_2018_POSITIONAL_SOURCE),
  positionalAward("TOTY2019", "Alisson", "Goalkeeper", UCL_ALISSON_GOALKEEPER_SOURCE),
  positionalAward("TOTY2019", "Virgil van Dijk", "Defender", UCL_2019_POSITIONAL_SOURCE),
  positionalAward("TOTY2019", "Frenkie de Jong", "Midfielder", UCL_2019_POSITIONAL_SOURCE),
  positionalAward("TOTY2019", "Lionel Messi", "Forward", UCL_2019_POSITIONAL_SOURCE),
  positionalAward("TOTY2020", "Manuel Neuer", "Goalkeeper", UCL_NEUER_GOALKEEPER_SOURCE),
  positionalAward("TOTY2020", "Joshua Kimmich", "Defender", UEFA_2020_AWARDS_SOURCE),
  positionalAward("TOTY2020", "Kevin De Bruyne", "Midfielder", UEFA_2020_AWARDS_SOURCE),
  positionalAward("TOTY2020", "Robert Lewandowski", "Forward", UEFA_2020_AWARDS_SOURCE),
  positionalAward("UCL2021", "Edouard Mendy", "Goalkeeper", UCL_MENDY_GOALKEEPER_SOURCE),
  positionalAward("UCL2021", "Rúben Dias", "Defender", UCL_2021_AWARDS_SOURCE),
  positionalAward("UCL2021", "N'Golo Kanté", "Midfielder", UCL_2021_AWARDS_SOURCE),
  positionalAward("UCL2021", "Erling Haaland", "Forward", UCL_2021_AWARDS_SOURCE),

  ballonDor("TOTY2002", "Ronaldo"),
  ballonDor("TOTY2003", "Pavel Nedvěd"),
  ballonDor("TOTY2004", "Andriy Shevchenko"),
  ballonDor("TOTY2005", "Ronaldinho"),
  ballonDor("TOTY2006", "Fabio Cannavaro"),
  ballonDor("TOTY2007", "Kaká"),
  ballonDor("TOTY2008", "Cristiano Ronaldo"),
  ballonDor("TOTY2009", "Lionel Messi"),
  ballonDor("TOTY2010", "Lionel Messi"),
  ballonDor("TOTY2011", "Lionel Messi"),
  ballonDor("TOTY2012", "Lionel Messi"),
  ballonDor("TOTY2013", "Cristiano Ronaldo"),
  ballonDor("TOTY2014", "Cristiano Ronaldo"),
  ballonDor("TOTY2015", "Lionel Messi"),
  ballonDor("TOTY2016", "Cristiano Ronaldo"),
  ballonDor("TOTY2017", "Cristiano Ronaldo"),
  ballonDor("TOTY2018", "Luka Modrić"),
  ballonDor("TOTY2019", "Lionel Messi"),
  ballonDor("UCL2022", "Karim Benzema"),
  ballonDor("UCL2025", "Ousmane Dembélé"),

  youngPlayer("UCL2022", "Vinícius Júnior"),
  youngPlayer("UCL2024", "Jude Bellingham"),
  youngPlayer("UCL2025", "Désiré Doué"),
];
