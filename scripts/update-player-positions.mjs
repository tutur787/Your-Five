import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PLAYERS_FILE = path.join(ROOT, "shared/src/players.ts");
const SOURCES_FILE = path.join(ROOT, ".position-sources.json");
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const POSITION_PATTERN = /(Point guard|Shooting guard|Small forward|Power forward|Center)/gi;
const POSITION_ABBR = {
  "point guard": "PG",
  "shooting guard": "SG",
  "small forward": "SF",
  "power forward": "PF",
  center: "C",
};
const TITLE_OVERRIDES = {
  "B.J. Armstrong": "B. J. Armstrong",
  "Greg Smith": "Greg Smith (basketball, born 1947)",
  "Jim Jackson": "Jim Jackson (basketball)",
};
const POSITION_OVERRIDES = {
  "Happy Hairston": {
    positions: ["PF"],
    source: "https://fr.wikipedia.org/wiki/Happy_Hairston",
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractRawSource(file) {
  const match = file.match(/const raw: Row\[\] = \[([\s\S]*?)\n\];/);
  if (!match) throw new Error("Could not find raw player rows.");
  return match[0];
}

function parseRows(rawBlock) {
  const arraySource = rawBlock.replace(/^const raw: Row\[\] = /, "").replace(/;$/, "");
  return Function(`"use strict"; return (${arraySource});`)();
}

function unique(items) {
  return [...new Set(items)];
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function positionsFromText(text) {
  const positions = [];
  for (const match of text.matchAll(POSITION_PATTERN)) {
    const position = POSITION_ABBR[match[1].toLowerCase()];
    if (position && !positions.includes(position)) positions.push(position);
  }
  return positions;
}

function extractField(wikitext, fieldName) {
  const match = wikitext.match(new RegExp(`\\n\\s*\\|\\s*${fieldName}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[a-zA-Z_]+\\s*=|\\n}})`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractInfobox(wikitext) {
  const start = wikitext.search(/\{\{Infobox basketball biography/i);
  if (start < 0) return "";
  const end = wikitext.indexOf("\n}}\n", start);
  return end < 0 ? wikitext.slice(start) : wikitext.slice(start, end + 4);
}

function sourceListedPositions(wikitext) {
  const field = extractField(wikitext, "career_position") || extractField(wikitext, "position");
  return positionsFromText(field);
}

function cardStartYear([, , era]) {
  return Number(era.slice(0, 4));
}

function careerYearRange(wikitext) {
  const infobox = extractInfobox(wikitext);
  const fields = [];
  for (const fieldName of ["career_start", "career_end"]) {
    const field = extractField(infobox, fieldName);
    if (field) fields.push(field);
  }
  for (const match of infobox.matchAll(/\n\|\s*years\d*\s*=([^\n]+)/gi)) {
    fields.push(match[1]);
  }
  const years = fields.flatMap((field) => [...field.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0])));
  if (years.length === 0) return null;
  const hasPresent = fields.some((field) => /present/i.test(field));
  return { min: Math.min(...years), max: hasPresent ? new Date().getFullYear() : Math.max(...years) };
}

function pageMatchesCards(wikitext, cards) {
  const range = careerYearRange(wikitext);
  if (!range) return true;
  return cards.some((card) => {
    const year = cardStartYear(card);
    return year >= range.min - 1 && year <= range.max + 1;
  });
}

function cardId([name, , era]) {
  return `${name}-${era}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatRow(row, positions) {
  const [name, , era, ppg, rpg, apg] = row;
  const stat = (value) => Number(value).toFixed(1);
  const [primary, secondary, tertiary] = positions;
  const extras = [secondary, tertiary].filter(Boolean).map((p) => `, "${p}"`).join("");
  return `  ["${name.replace(/"/g, '\\"')}", "${primary}", "${era}", ${stat(ppg)}, ${stat(rpg)}, ${stat(apg)}${extras}]`;
}

async function wikiJson(params, attempt = 1) {
  const url = new URL(WIKI_API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { "user-agent": "fiveaside position source updater" },
  });
  if (response.status === 429 && attempt <= 5) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "30");
    await sleep((retryAfter + 2) * 1000);
    return wikiJson(params, attempt + 1);
  }
  if (!response.ok) throw new Error(`Wikipedia fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchPagesByTitle(titles) {
  const pages = new Map();
  for (const titleChunk of chunk(titles, 40)) {
    const data = await wikiJson({
      action: "query",
      redirects: "1",
      titles: titleChunk.join("|"),
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      format: "json",
      formatversion: "2",
    });
    for (const page of data.query.pages ?? []) {
      if (!page.missing) pages.set(page.title, page);
    }
    for (const redirect of data.query.redirects ?? []) {
      const page = data.query.pages?.find((p) => p.title === redirect.to);
      if (page && !page.missing) pages.set(redirect.from, page);
    }
  }
  return pages;
}

async function searchPage(name, cards) {
  if (TITLE_OVERRIDES[name]) {
    const pages = await fetchPagesByTitle([TITLE_OVERRIDES[name]]);
    return pages.get(TITLE_OVERRIDES[name]) ?? null;
  }
  const data = await wikiJson({
    action: "opensearch",
    search: `${name} basketball`,
    namespace: "0",
    limit: "5",
    format: "json",
  });
  const titles = data[1] ?? [];
  if (titles.length === 0) return null;
  const pages = await fetchPagesByTitle(titles);
  for (const title of titles) {
    const page = pages.get(title);
    const wikitext = page?.revisions?.[0]?.slots?.main?.content ?? "";
    if (sourceListedPositions(wikitext).length > 0 && pageMatchesCards(wikitext, cards)) return page;
  }
  return null;
}

async function main() {
  const file = await fs.readFile(PLAYERS_FILE, "utf8");
  const rawBlock = extractRawSource(file);
  const rows = parseRows(rawBlock);
  const names = unique(rows.map((row) => row[0]));
  const exactPages = await fetchPagesByTitle(names.map((name) => TITLE_OVERRIDES[name] ?? name));
  const sources = {};
  const positionsByName = new Map();
  const unresolved = [];
  const cardsByName = new Map();
  for (const row of rows) {
    if (!cardsByName.has(row[0])) cardsByName.set(row[0], []);
    cardsByName.get(row[0]).push(row);
  }

  for (const name of names) {
    if (POSITION_OVERRIDES[name]) {
      positionsByName.set(name, POSITION_OVERRIDES[name].positions);
      sources[name] = POSITION_OVERRIDES[name].source;
      console.log(`${name}: ${POSITION_OVERRIDES[name].positions.join("/")} (manual source override)`);
      continue;
    }
    const byNameCards = cardsByName.get(name);
    const lookupTitle = TITLE_OVERRIDES[name] ?? name;
    let page = exactPages.get(lookupTitle);
    let wikitext = page?.revisions?.[0]?.slots?.main?.content ?? "";
    let positions = sourceListedPositions(wikitext);
    if (positions.length === 0 || !pageMatchesCards(wikitext, byNameCards)) {
      page = await searchPage(name, byNameCards);
      wikitext = page?.revisions?.[0]?.slots?.main?.content ?? "";
      positions = sourceListedPositions(wikitext);
    }
    if (positions.length === 0 || !page) {
      unresolved.push(name);
      continue;
    }
    positionsByName.set(name, positions.slice(0, 3));
    sources[name] = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`;
    console.log(`${name}: ${positions.slice(0, 3).join("/")} (${page.title})`);
  }

  if (unresolved.length > 0) {
    throw new Error(`No exact source-listed positions found for: ${unresolved.join(", ")}`);
  }

  const newRows = rows.map((row) => formatRow(row, positionsByName.get(row[0]))).join(",\n");
  const newRawBlock = `const raw: Row[] = [\n${newRows}\n];`;
  const updated = file
    .replace(
      /\/\/ for per-game stats\)\. Positions are source-listed[\s\S]*?where Basketball-Reference lists more than one\.|\/\/ for per-game stats\)\. Secondary\/tertiary positions[\s\S]*?\/\/ PF\/C — e\.g\. LeBron James \(SF\) picks up real PG and PF evidence this way\. Not every card has one\./,
      "// for per-game stats). Positions are source-listed from Wikipedia infoboxes: the first\n// listed exact basketball position is used as primary, followed by any listed secondary/tertiary\n// exact positions. No stats-derived or rule-based position inference is used."
    )
    .replace(rawBlock, newRawBlock);

  await fs.writeFile(PLAYERS_FILE, updated);
  await fs.writeFile(SOURCES_FILE, `${JSON.stringify(sources, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
