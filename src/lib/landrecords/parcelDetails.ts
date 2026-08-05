import type { ParcelProperties } from "./parcelPropertyMap";
import { computeOwnerOccupied } from "./ownerOccupied";

const PROPERTY_LABELS: Record<string, string> = {
  PROP_ID: "Parcel ID",
  PARCEL_ID_ALT: "Alternate Parcel ID",
  LL_UUID: "Stable Parcel UUID",
  LL_STABLE_ID: "Stable Parcel ID",
  TAX_ACCT: "Tax Account #",
  SITUS_ADDR: "Site Address",
  SITUS_CITY: "City",
  SITUS_STATE: "State",
  SITUS_ZIP: "Zip Code",
  CITY: "City",
  PLACE_NAME: "Place Name",
  OWNER_NAME: "Owner",
  MAIL_ADDR: "Mailing Address",
  MAIL_CITY: "Mailing City",
  MAIL_STATE: "Mailing State",
  MAIL_ZIP: "Mailing Zip",
  DPV_MATCH: "Mail Deliverable",
  DPV_NOTES: "Deliverability Notes",
  MKT_VAL: "Total Assessed Value",
  LAND_VAL: "Land Value",
  IMPR_VAL: "Improvement Value",
  AG_VAL: "Agriculture Value",
  SALE_PRICE: "Last Sale Price",
  SALE_DATE: "Last Sale Date",
  PRIOR_SALE_PRICE: "Prior Sale Price",
  PRIOR_SALE_DATE: "Prior Sale Date",
  TAX_YEAR: "Tax Year",
  GIS_ACRES: "Acres",
  LL_GIS_ACRES: "GIS Acres",
  LL_GIS_SQFT: "GIS Square Feet",
  CALC_AREA_SQM: "Lot Area",
  YEAR_BUILT: "Year Built",
  BLDG_SQFT: "Building Sq Ft",
  NUM_BLDGS: "Buildings",
  NUM_UNITS: "Units",
  NUM_FLOORS: "Floors",
  BLDG_COUNT: "Building Count (GIS)",
  BLDG_FOOTPRINT_SQFT: "Building Footprint",
  BEDROOMS: "Bedrooms",
  BATHROOMS: "Full Baths",
  HALF_BATHS: "Half Baths",
  USE_CODE: "Land Use Code",
  USE_DESC: "Land Use",
  ZONING: "Zoning",
  ZONING_CODE: "Zoning Code",
  LBCS_ACTIVITY: "LBCS Activity",
  LBCS_FUNCTION: "LBCS Function",
  LBCS_STRUCTURE: "LBCS Structure",
  LBCS_SITE: "LBCS Site",
  LBCS_OWNERSHIP: "LBCS Ownership",
  HOMESTEAD_EXEMPTION: "Homestead Exemption",
  QOZ: "Opportunity Zone",
  QOZ_TRACT: "Opportunity Zone Tract",
  SCHOOL_DISTRICT: "School District",
  SCHOOL_DIST_ID: "School District ID",
  LEGAL_DESC: "Legal Description",
  SUBDIVISION: "Subdivision",
  LOT: "Lot",
  BLOCK: "Block",
  BOOK: "Book",
  PAGE: "Page",
  TOWNSHIP: "Township",
  SECTION: "Section",
  QTR_SECTION: "Quarter Section",
  RANGE: "Range",
  COUNTY: "County",
  COUNTY_FIPS: "County FIPS",
  LATITUDE: "Latitude",
  LONGITUDE: "Longitude",
  CENSUS_TRACT: "Census Tract",
  CENSUS_BLOCK: "Census Block",
  CENSUS_BLOCKGROUP: "Census Block Group",
  CENSUS_ZCTA: "Census ZCTA",
  CONG_DIST: "Congressional District",
  STATE_HOUSE_DIST: "State House District",
  STATE_SENATE_DIST: "State Senate District",
  JURISDICTION_PATH: "Jurisdiction",
  LAST_UPDATED: "Data Last Updated",
  ADDRESS_SOURCE: "Address Source",
  PARVAL_SOURCE: "Total Value Source",
  IMPROV_SOURCE: "Improvement Value Source",
  LANDVAL_SOURCE: "Land Value Source",
};

export const CATEGORIES = {
  identification: {
    title: "Identification",
    keys: [
      "PROP_ID", "PARCEL_ID_ALT", "LL_UUID", "LL_STABLE_ID", "TAX_ACCT",
    ],
  },
  address: {
    title: "Address",
    keys: [
      "SITUS_ADDR", "SITUS_CITY", "SITUS_STATE", "SITUS_ZIP", "CITY", "PLACE_NAME",
    ],
  },
  ownership: {
    title: "Ownership",
    keys: ["OWNER_NAME", "HOMESTEAD_EXEMPTION"],
  },
  property: {
    title: "Property",
    keys: [
      "USE_CODE", "USE_DESC", "LBCS_ACTIVITY", "LBCS_FUNCTION", "LBCS_STRUCTURE",
      "LBCS_SITE", "LBCS_OWNERSHIP", "YEAR_BUILT", "BLDG_SQFT", "BLDG_FOOTPRINT_SQFT",
      "NUM_BLDGS", "NUM_UNITS", "NUM_FLOORS", "BLDG_COUNT", "GIS_ACRES", "LL_GIS_ACRES",
      "LL_GIS_SQFT", "CALC_AREA_SQM", "BEDROOMS", "BATHROOMS", "HALF_BATHS",
      "ZONING", "ZONING_CODE",
    ],
  },
  valuation: {
    title: "Valuation",
    keys: [
      "MKT_VAL", "LAND_VAL", "IMPR_VAL", "AG_VAL", "SALE_PRICE", "SALE_DATE",
      "PRIOR_SALE_PRICE", "PRIOR_SALE_DATE", "TAX_YEAR", "PARVAL_SOURCE",
      "IMPROV_SOURCE", "LANDVAL_SOURCE",
    ],
  },
  location: {
    title: "Location",
    keys: [
      "LATITUDE", "LONGITUDE", "COUNTY", "COUNTY_FIPS", "CENSUS_TRACT",
      "CENSUS_BLOCK", "CENSUS_BLOCKGROUP", "CENSUS_ZCTA", "PLACE_NAME",
      "SCHOOL_DISTRICT", "SCHOOL_DIST_ID", "CONG_DIST", "STATE_HOUSE_DIST",
      "STATE_SENATE_DIST", "QOZ", "QOZ_TRACT", "JURISDICTION_PATH", "LAST_UPDATED",
    ],
  },
  mailing: {
    title: "Mailing Address",
    keys: [
      "MAIL_ADDR", "MAIL_CITY", "MAIL_STATE", "MAIL_ZIP", "DPV_MATCH",
      "DPV_NOTES", "ADDRESS_SOURCE",
    ],
  },
  legal: {
    title: "Legal & Lot",
    keys: [
      "LEGAL_DESC", "SUBDIVISION", "LOT", "BLOCK", "BOOK", "PAGE",
      "TOWNSHIP", "SECTION", "QTR_SECTION", "RANGE",
    ],
  },
} as const;

export type CategoryId = keyof typeof CATEGORIES | "other";

export type DetailRow = { key: string; label: string; value: string };

const CURRENCY_KEYS = new Set([
  "MKT_VAL", "LAND_VAL", "IMPR_VAL", "AG_VAL", "SALE_PRICE", "PRIOR_SALE_PRICE",
]);
const SQFT_KEYS = new Set([
  "BLDG_SQFT", "LL_GIS_SQFT", "BLDG_FOOTPRINT_SQFT",
]);
const ACRE_KEYS = new Set(["GIS_ACRES", "LL_GIS_ACRES"]);
const DATE_KEYS = new Set(["SALE_DATE", "PRIOR_SALE_DATE", "LAST_UPDATED"]);
const ZERO_OK = new Set([
  "BEDROOMS", "BATHROOMS", "HALF_BATHS", "NUM_BLDGS", "NUM_UNITS",
  "NUM_FLOORS", "BLDG_COUNT", "TAX_YEAR", "YEAR_BUILT",
]);
const YES_NO = new Set(["HOMESTEAD_EXEMPTION", "QOZ"]);
const DPV_LABELS: Record<string, string> = {
  Y: "Yes — deliverable",
  D: "Yes — missing unit #",
  S: "Yes — extra info ignored",
  N: "No — not deliverable",
};

const keyToCategory: Record<string, CategoryId> = {};
for (const [cat, { keys }] of Object.entries(CATEGORIES)) {
  for (const k of keys) keyToCategory[k] = cat as CategoryId;
}

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (!s || (s === "0" && !ZERO_OK.has(key))) return null;
  if (CURRENCY_KEYS.has(key)) {
    const num = parseFloat(s.replace(/[$,]/g, ""));
    if (!Number.isNaN(num)) return `$${num.toLocaleString()}`;
  }
  if (SQFT_KEYS.has(key)) {
    const num = parseFloat(s.replace(/,/g, ""));
    if (!Number.isNaN(num)) return `${num.toLocaleString()} sq ft`;
  }
  if (ACRE_KEYS.has(key)) {
    const num = parseFloat(s);
    if (!Number.isNaN(num)) {
      return `${num.toLocaleString(undefined, { maximumFractionDigits: 4 })} ac`;
    }
  }
  if (key === "CALC_AREA_SQM") {
    const num = parseFloat(s);
    if (!Number.isNaN(num)) {
      return `${(num * 10.7639).toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft`;
    }
  }
  if (DATE_KEYS.has(key)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }
  if (YES_NO.has(key)) {
    const n = s.toLowerCase();
    if (["yes", "y", "true", "1"].includes(n)) return "Yes";
    if (["no", "n", "false", "0"].includes(n)) return "No";
  }
  if (key === "DPV_MATCH") return DPV_LABELS[s.toUpperCase()] || s;
  return s;
}

function keyToLabel(key: string): string {
  return (
    PROPERTY_LABELS[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function buildCategorizedProperties(
  properties: ParcelProperties,
  opts?: { lat?: number; lng?: number; address?: string }
): Record<CategoryId, DetailRow[]> {
  const result: Record<CategoryId, DetailRow[]> = {
    identification: [],
    address: [],
    ownership: [],
    property: [],
    valuation: [],
    location: [],
    mailing: [],
    legal: [],
    other: [],
  };
  const seen = new Set<string>();
  const add = (cat: CategoryId, key: string, value: unknown) => {
    if (seen.has(key)) return;
    const formatted = formatValue(key, value);
    if (!formatted) return;
    seen.add(key);
    result[cat].push({ key, label: keyToLabel(key), value: formatted });
  };

  for (const [key, value] of Object.entries(properties)) {
    add(keyToCategory[key] || "other", key, value);
  }
  if (opts?.lat != null) add("location", "LATITUDE", opts.lat);
  if (opts?.lng != null) add("location", "LONGITUDE", opts.lng);
  if (opts?.address && result.address.length === 0) {
    add("address", "SITUS_ADDR", opts.address);
  }

  const oo = computeOwnerOccupied(properties);
  if (oo) add("ownership", "Owner Occupied", oo);

  const yearBuilt = properties.YEAR_BUILT
    ? parseInt(String(properties.YEAR_BUILT), 10)
    : NaN;
  if (Number.isFinite(yearBuilt)) {
    add("property", "Age", `${new Date().getFullYear() - yearBuilt} years`);
  }

  return result;
}

export function parcelQuickStats(
  properties: ParcelProperties,
  categorized: Record<CategoryId, DetailRow[]>
) {
  const pick = (cat: CategoryId, keys: string[]) =>
    categorized[cat]?.find((i) => keys.includes(i.key))?.value;

  const qoz = String(properties.QOZ || "").trim().toLowerCase();
  return {
    value: pick("valuation", ["MKT_VAL"]),
    acres: pick("property", ["LL_GIS_ACRES", "GIS_ACRES", "CALC_AREA_SQM"]),
    sqft: pick("property", ["BLDG_SQFT"]),
    yearBuilt: properties.YEAR_BUILT ? String(properties.YEAR_BUILT) : null,
    zoning: properties.ZONING || properties.ZONING_CODE || null,
    landUse: properties.USE_DESC || null,
    schoolDistrict: properties.SCHOOL_DISTRICT || null,
    isQOZ: ["yes", "y", "true", "1"].includes(qoz),
  };
}
