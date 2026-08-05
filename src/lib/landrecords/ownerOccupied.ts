/**
 * Situs vs mailing — owner-occupied when mailing contains the site address
 * after normalizing street suffixes / directionals. Returns 'Yes' | 'No' | null.
 */

const STREET_SUFFIXES = [
  "street", "st", "avenue", "ave", "av", "boulevard", "blvd", "bl",
  "road", "rd", "lane", "ln", "drive", "dr", "circle", "cir", "crcl",
  "court", "ct", "place", "pl", "parkway", "pkwy", "pky", "highway",
  "hwy", "hy", "way", "wy", "terrace", "ter", "terr", "trail", "trl",
  "tr", "cove", "cv", "loop", "lp", "square", "sq", "alley", "aly",
  "path", "walk", "run", "row", "crossing", "xing", "manor", "mnr",
  "point", "pt", "pass", "bypass", "byp", "plaza", "plz", "ridge",
  "rdg", "hollow", "holw", "spring", "spg", "creek", "crk", "center",
  "ctr", "grove", "grv",
];

const DIRECTIONALS: Record<string, string> = {
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
  north: "north", south: "south", east: "east", west: "west",
  northeast: "northeast", northwest: "northwest",
  southeast: "southeast", southwest: "southwest",
};

const UNIT_RE =
  /\b(?:apt|apartment|unit|ste|suite|fl|floor|rm|room|#)\b\.?\s*[a-z0-9-]*/gi;

const SUFFIX_RE = new RegExp(
  `\\s+(${STREET_SUFFIXES.join("|")})\\b\\.?` +
    `(?:\\s+(?:n|s|e|w|ne|nw|se|sw|north|south|east|west|northeast|northwest|southeast|southwest))?` +
    `(?:\\s+(?:apt|apartment|unit|ste|suite|fl|floor|rm|room|#)\\.?\\s*[a-z0-9-]*)?` +
    `\\s*$`,
  "i"
);

function normalizeAddr(raw: string): string {
  let s = raw.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(UNIT_RE, " ").replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").map((t) => DIRECTIONALS[t] || t);
  s = tokens.join(" ");
  s = s.replace(SUFFIX_RE, (m, suf: string) => {
    const canon =
      STREET_SUFFIXES.find(
        (x) => x.length > 2 && (x === suf || suf.startsWith(x[0]!))
      ) || suf;
    // Collapse to short form for comparison
    const short =
      {
        street: "st", avenue: "ave", boulevard: "blvd", road: "rd",
        lane: "ln", drive: "dr", circle: "cir", court: "ct", place: "pl",
        parkway: "pkwy", highway: "hwy", terrace: "ter", trail: "trl",
      }[canon] || canon;
    return ` ${short}`;
  });
  return s.replace(/\s+/g, " ").trim();
}

export function computeOwnerOccupied(
  properties: Record<string, unknown> | null | undefined
): "Yes" | "No" | null {
  if (!properties) return null;
  const situs = String(
    properties.SITUS_ADDR || properties.SITE_ADDR || properties.ADDRESS || ""
  ).trim();
  const mail = String(
    properties.MAIL_ADDR || properties.MAILING_ADDR || ""
  ).trim();
  if (!situs || !mail) return null;
  const a = normalizeAddr(situs);
  const b = normalizeAddr(mail);
  if (!a || !b) return null;
  if (b.includes(a) || a.includes(b)) return "Yes";
  // Compare house number + first street token
  const aParts = a.split(" ");
  const bParts = b.split(" ");
  if (
    aParts[0] &&
    aParts[0] === bParts[0] &&
    aParts[1] &&
    b.includes(aParts[1])
  ) {
    return "Yes";
  }
  return "No";
}
