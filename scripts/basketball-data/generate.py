#!/usr/bin/env python3
"""Generate the committed NBA 2025/26 six-per-team player database."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
from nba_api.stats.endpoints import leaguedashplayerstats, leaguedashteamstats

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "basketball-data"
OUTPUT = ROOT / "shared" / "src" / "seasonBasketball" / "basketball2025Data.ts"
MANIFEST = ROOT / "shared" / "src" / "seasonBasketball" / "basketball2025Provenance.json"
SEASON = "2025-26"
WIKI_API = "https://en.wikipedia.org/w/api.php"
POSITION_RE = re.compile(r"Point guard|Shooting guard|Small forward|Power forward|Center", re.I)
POSITION_MAP = {
    "point guard": "PG", "shooting guard": "SG", "small forward": "SF",
    "power forward": "PF", "center": "C",
}
AWARD_SOURCE = "https://pr.nba.com/voting-results-2025-26-nba-regular-season-awards/"
CHAMPION_SOURCE = "https://www.nba.com/news/knicks-rally-win-nba-title"
POSITION_OVERRIDES: dict[str, tuple[list[str], str]] = {
    # English Wikipedia currently uses the unsupported broad label "Guard"; the German
    # Wikipedia infobox lists both exact positions.
    "Brandin Podziemski": (["PG", "SG"], "https://de.wikipedia.org/wiki/Brandin_Podziemski"),
}
TITLE_OVERRIDES = {
    "Ace Bailey": "Ace Bailey (basketball)",
    "Anthony Black": "Anthony Black (basketball)",
    "Ben Sheppard": "Ben Sheppard (basketball)",
    "Brandon Miller": "Brandon Miller (basketball, born 2002)",
    "Jose Alvarado": "Jose Alvarado (basketball)",
    "Ronald Holland II": "Ron Holland (basketball)",
    "Tre Johnson": "Tre Johnson (basketball)",
}

MVP = {"Shai Gilgeous-Alexander"}
DPOY = {"Victor Wembanyama"}
ALL_NBA = {
    "Shai Gilgeous-Alexander", "Nikola Jokić", "Victor Wembanyama", "Luka Dončić",
    "Cade Cunningham", "Jaylen Brown", "Kawhi Leonard", "Donovan Mitchell",
    "Kevin Durant", "Jalen Brunson", "Tyrese Maxey", "Jamal Murray", "Jalen Johnson",
    "Jalen Duren", "Chet Holmgren",
}
ALL_DEFENSE = {
    "Victor Wembanyama", "Chet Holmgren", "Ausar Thompson", "Rudy Gobert",
    "Derrick White", "Bam Adebayo", "OG Anunoby", "Scottie Barnes",
    "Dyson Daniels", "Cason Wallace",
}


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode()).hexdigest()


def finite(value: Any, field: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Non-finite {field}: {value!r}")
    return number


def endpoint_rows(name: str, factory, offline: bool, **params: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.json"
    if path.exists():
        payload = json.loads(path.read_text())
    elif offline:
        raise FileNotFoundError(f"Missing offline cache: {path}")
    else:
        endpoint = factory(timeout=180, **params)
        payload = {
            "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "parameters": params,
            "rows": endpoint.get_data_frames()[0].to_dict(orient="records"),
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        time.sleep(1)
    rows = payload["rows"]
    return rows, {
        "name": name,
        "parameters": payload["parameters"],
        "retrievedAt": payload["retrievedAt"],
        "contentSha256": digest(rows),
    }


def wiki_json(params: dict[str, str]) -> dict[str, Any]:
    for attempt in range(8):
        response = requests.get(WIKI_API, params=params, headers={"User-Agent": "Your Five basketball data generator"}, timeout=60)
        if response.status_code != 429:
            response.raise_for_status()
            return response.json()
        time.sleep(max(int(response.headers.get("retry-after", "0")) + 2, min(60, 2 ** attempt)))
    raise RuntimeError("Wikipedia rate limit did not clear")


def position_field(wikitext: str) -> str:
    match = re.search(r"\n\s*\|\s*(?:career_position|position)\s*=([\s\S]*?)(?=\n\s*\|\s*[a-zA-Z_]+\s*=|\n}})", wikitext, re.I)
    return match.group(1).strip() if match else ""


def exact_positions(wikitext: str) -> list[str]:
    result: list[str] = []
    for label in POSITION_RE.findall(position_field(wikitext)):
        position = POSITION_MAP[label.lower()]
        if position not in result:
            result.append(position)
    return result[:3]


def fetch_wiki_page(title: str) -> dict[str, Any] | None:
    data = wiki_json({
        "action": "query", "redirects": "1", "titles": title, "prop": "revisions",
        "rvprop": "content", "rvslots": "main", "format": "json", "formatversion": "2",
    })
    pages = data.get("query", {}).get("pages", [])
    return next((page for page in pages if not page.get("missing")), None)


def source_position(name: str, offline: bool) -> tuple[list[str], str, str]:
    if name in POSITION_OVERRIDES:
        positions, source = POSITION_OVERRIDES[name]
        return positions, source, hashlib.sha256(f"{source}|{'/'.join(positions)}".encode()).hexdigest()
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(name.encode()).hexdigest()
    path = CACHE / f"position-{key}.json"
    if path.exists():
        payload = json.loads(path.read_text())
        return payload["positions"], payload["source"], payload["hash"]
    if offline:
        raise FileNotFoundError(f"Missing position source for {name}")
    page = fetch_wiki_page(TITLE_OVERRIDES.get(name, name))
    wikitext = page.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "") if page else ""
    positions = exact_positions(wikitext)
    if not positions:
        search = wiki_json({"action": "opensearch", "search": f"{name} basketball", "limit": "6", "namespace": "0", "format": "json"})
        for title in search[1]:
            candidate = fetch_wiki_page(title)
            text = candidate.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "") if candidate else ""
            candidate_positions = exact_positions(text)
            if candidate_positions:
                page, wikitext, positions = candidate, text, candidate_positions
                break
    if not page or not positions:
        raise ValueError(f"No exact source-listed position for {name}")
    source = f"https://en.wikipedia.org/wiki/{page['title'].replace(' ', '_')}"
    payload = {"name": name, "positions": positions, "source": source, "hash": hashlib.sha256(wikitext.encode()).hexdigest()}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return positions, source, payload["hash"]


def prefetch_positions(names: list[str], offline: bool) -> None:
    missing = []
    for name in names:
        if name in POSITION_OVERRIDES:
            continue
        key = hashlib.sha1(name.encode()).hexdigest()
        if not (CACHE / f"position-{key}.json").exists(): missing.append(name)
    if not missing or offline:
        return
    for start in range(0, len(missing), 40):
        chunk = missing[start:start + 40]
        data = wiki_json({
            "action": "query", "redirects": "1", "titles": "|".join(chunk), "prop": "revisions",
            "rvprop": "content", "rvslots": "main", "format": "json", "formatversion": "2",
        })
        query = data.get("query", {})
        pages = {page.get("title"): page for page in query.get("pages", []) if not page.get("missing")}
        redirects = {item.get("from"): item.get("to") for item in query.get("redirects", [])}
        normalized = {item.get("from"): item.get("to") for item in query.get("normalized", [])}
        for name in chunk:
            title = redirects.get(normalized.get(name, name), normalized.get(name, name))
            page = pages.get(title)
            text = page.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "") if page else ""
            positions = exact_positions(text)
            if not page or not positions:
                continue
            source = f"https://en.wikipedia.org/wiki/{page['title'].replace(' ', '_')}"
            payload = {"name": name, "positions": positions, "source": source, "hash": hashlib.sha256(text.encode()).hexdigest()}
            key = hashlib.sha1(name.encode()).hexdigest()
            (CACHE / f"position-{key}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        time.sleep(2)


def row_key(row: dict[str, Any]) -> tuple[int, int]:
    return int(row["PLAYER_ID"]), int(row["TEAM_ID"])


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def historical_teammate_pairs() -> set[str]:
    source = (ROOT / "shared" / "src" / "players.ts").read_text()
    match = re.search(r"export const TEAMMATE_PAIRS[\s\S]*?new Set<string>\(\[([\s\S]*?)\n\]\);", source)
    if not match:
        raise ValueError("Could not read the verified NBA teammate ledger")
    return set(re.findall(r'"([^"\\]+\|[^"\\]+)"', match.group(1)))


def generate(offline: bool) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    common = {"season": SEASON, "season_type_all_star": "Regular Season", "per_mode_detailed": "Totals"}
    base, source_base = endpoint_rows("players-base", leaguedashplayerstats.LeagueDashPlayerStats, offline, measure_type_detailed_defense="Base", **common)
    advanced, source_advanced = endpoint_rows("players-advanced", leaguedashplayerstats.LeagueDashPlayerStats, offline, measure_type_detailed_defense="Advanced", **common)
    starters, source_starters = endpoint_rows("players-starters", leaguedashplayerstats.LeagueDashPlayerStats, offline, measure_type_detailed_defense="Base", starter_bench_nullable="Starters", **common)
    teams, source_teams = endpoint_rows("teams-base", leaguedashteamstats.LeagueDashTeamStats, offline, measure_type_detailed_defense="Base", **common)

    if len(teams) != 30 or sum(int(row["GP"]) for row in teams) // 2 != 1230:
        raise ValueError("2025/26 regular season is incomplete")
    team_by_id = {int(row["TEAM_ID"]): row for row in teams}
    advanced_by_key = {row_key(row): row for row in advanced if int(row["TEAM_ID"]) != 0}
    starts_by_key = {row_key(row): int(row["GP"]) for row in starters if int(row["TEAM_ID"]) != 0}
    stints = [row for row in base if int(row["TEAM_ID"]) in team_by_id and row.get("TEAM_ABBREVIATION") not in (None, "TOT")]
    selected: list[dict[str, Any]] = []
    for team_id in sorted(team_by_id):
        ranked = sorted(
            (row for row in stints if int(row["TEAM_ID"]) == team_id),
            key=lambda row: (-finite(row["MIN"], "MIN"), -int(row["GP"]), -starts_by_key.get(row_key(row), 0), int(row["PLAYER_ID"])),
        )
        if len(ranked) < 6:
            raise ValueError(f"Team {team_id} has fewer than six player stints")
        selected.extend(ranked[:6])

    if len(selected) != 180:
        raise ValueError(f"Expected 180 cards, found {len(selected)}")
    prefetch_positions(sorted({str(row["PLAYER_NAME"]) for row in selected}), offline)
    weighted_def = [(finite(row["DEF_RATING"], "DEF_RATING"), finite(row["MIN"], "MIN")) for row in advanced if int(row["TEAM_ID"]) != 0 and finite(row["MIN"], "MIN") > 0]
    league_def_rating = sum(value * minutes for value, minutes in weighted_def) / sum(minutes for _, minutes in weighted_def)

    cards: list[dict[str, Any]] = []
    position_sources: list[dict[str, Any]] = []
    for row in selected:
        player_id, team_id = row_key(row)
        name = str(row["PLAYER_NAME"])
        positions, position_url, position_hash = source_position(name, offline)
        position_sources.append({"playerId": player_id, "name": name, "url": position_url, "contentSha256": position_hash, "positions": positions})
        gp = int(row["GP"])
        if gp <= 0:
            raise ValueError(f"{name} has no games")
        advanced_row = advanced_by_key.get((player_id, team_id))
        if not advanced_row:
            raise ValueError(f"Missing advanced row for {name} / {team_id}")
        team = team_by_id[team_id]
        code = str(row["TEAM_ABBREVIATION"])
        accolades: dict[str, int] = {}
        if name in MVP: accolades["mvp"] = 1
        if name in DPOY: accolades["dpoy"] = 1
        if name in ALL_NBA: accolades["allNba"] = 1
        if name in ALL_DEFENSE: accolades["allDefense"] = 1
        if code == "NYK": accolades["champion"] = 1
        card = {
            "sport": "basketball", "competition": "nba-2025-26",
            "id": f"nba-2025-26-{player_id}-{code.lower()}", "sourceIdentity": f"nba:{player_id}",
            "name": name, "team": str(team["TEAM_NAME"]), "teamCode": code,
            "position": positions[0], "era": "2025-26",
            "stats": {
                "ppg": finite(row["PTS"], "PTS") / gp, "rpg": finite(row["REB"], "REB") / gp,
                "apg": finite(row["AST"], "AST") / gp, "spg": finite(row["STL"], "STL") / gp,
                "bpg": finite(row["BLK"], "BLK") / gp, "plusMinus": finite(row["PLUS_MINUS"], "PLUS_MINUS") / gp,
                "defRtgVsAvg": league_def_rating - finite(advanced_row["DEF_RATING"], "DEF_RATING"),
            },
            "teamWinPct": finite(team["W_PCT"], "W_PCT"),
            "ranking": {"minutes": finite(row["MIN"], "MIN"), "games": gp, "starts": starts_by_key.get((player_id, team_id), 0)},
        }
        if len(positions) > 1: card["secondaryPosition"] = positions[1]
        if len(positions) > 2: card["tertiaryPosition"] = positions[2]
        if accolades: card["accolades"] = accolades
        cards.append(card)

    teammate_pairs = historical_teammate_pairs()
    for card in cards:
        links = []
        for candidate in cards:
            if card["id"] == candidate["id"]:
                continue
            pair = "|".join(sorted((card["name"], candidate["name"])))
            if card["teamCode"] == candidate["teamCode"] or pair in teammate_pairs:
                links.append(candidate["id"])
        if links:
            card["chemistryWith"] = links

    manifest = {
        "schemaVersion": 1, "season": SEASON, "nbaApiVersion": "1.11.4",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "selection": "Six team-specific player stints per NBA team ranked by regular-season minutes, games, starts, then NBA player ID.",
        "endpoints": [source_base, source_advanced, source_starters, source_teams],
        "positionSources": position_sources,
        "awardSources": [AWARD_SOURCE, CHAMPION_SOURCE],
        "chemistrySources": [
            {
                "kind": "current-season-team",
                "source": source_base["name"],
                "description": "Players with the same 2025/26 NBA team ID.",
            },
            {
                "kind": "historical-team-season",
                "source": "shared/src/players.ts#TEAMMATE_PAIRS",
                "description": "Existing verified NBA team-season overlap ledger used by NBA All-Time.",
            },
        ],
        "teamCount": 30, "completedGames": 1230, "cardCount": 180,
        "leagueDefensiveRating": league_def_rating,
        "scoringPolicy": "Raw 2025/26 production is used without era adjustment inside the single-season pool.",
        "cardsSha256": "",
        "cards": [{"id": card["id"], "sourceIdentity": card["sourceIdentity"], "teamCode": card["teamCode"], **card["ranking"]} for card in cards],
    }
    for card in cards:
        del card["ranking"]
        for key, value in card["stats"].items(): card["stats"][key] = round(value, 3)
        card["teamWinPct"] = round(card["teamWinPct"], 4)
    manifest["cardsSha256"] = digest(cards)
    return cards, manifest


def render_ts(cards: list[dict[str, Any]]) -> str:
    data = json.dumps(cards, ensure_ascii=False, indent=2)
    return "import type { BasketballPlayerCard } from \"../types\";\n\n" + f"export const BASKETBALL_2025_DATABASE: BasketballPlayerCard[] = {data};\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    cards, manifest = generate(args.offline or args.verify)
    output = render_ts(cards)
    if args.verify:
        if not OUTPUT.exists() or OUTPUT.read_text() != output:
            raise SystemExit("Generated basketball database is stale. Run npm run data:basketball-season.")
        committed = json.loads(MANIFEST.read_text())
        immutable = ("schemaVersion", "season", "nbaApiVersion", "selection", "teamCount", "completedGames", "cardCount", "cardsSha256", "cards")
        for key in immutable:
            if committed.get(key) != manifest.get(key):
                raise SystemExit(f"Basketball provenance mismatch: {key}")
        print("Verified 30 teams, 1,230 games, 180 cards, positions, metrics, and ranking inputs.")
        return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(output)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Generated {len(cards)} cards in {OUTPUT}")


if __name__ == "__main__":
    main()
