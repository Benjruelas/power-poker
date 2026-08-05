/** Map raw LandRecords parcel_us properties to canonical fields. */

export type ParcelProperties = Record<string, string | number>;

export function canonicalParcelId(
  raw: Record<string, unknown> | null | undefined
): string {
  if (!raw) return "";
  const id = raw.parcelid ?? raw.lrid;
  return id != null && id !== "" ? String(id).trim() : "";
}

function splitCityState(ownercity: unknown, ownerstate: unknown) {
  const state = ownerstate != null ? String(ownerstate) : "";
  const city = ownercity != null ? String(ownercity) : "";
  if (state) return { city, state };
  if (!city) return { city: "", state: "" };
  const parts = city.trim().split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    if (last.length === 2 || last.length <= 8) {
      return { city: parts.slice(0, -1).join(" "), state: last };
    }
  }
  return { city, state: "" };
}

function str(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v);
}

function numOrStr(v: unknown): string | number {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n : String(v);
}

const CANONICAL_CONSUMED = new Set([
  "parcelid", "lrid", "parcelid2", "ll_uuid", "ll_stable_id", "taxacctnum",
  "parceladdr", "placename", "parcelcity", "parcelstate", "parcelzip",
  "ownername", "owneraddr", "ownercity", "ownerstate", "ownerzip",
  "totalvalue", "landvalue", "imprvalue", "agvalue",
  "saleamt", "saledate", "prior_sale_amount", "prior_sale_date",
  "taxyear", "taxacres", "assdacres", "calcarea", "ll_gisacre", "ll_gissqft",
  "yearbuilt", "bldgsqft", "numbldgs", "numunits", "numfloors",
  "bedrooms", "fullbaths", "halfbaths",
  "ll_bldg_count", "ll_bldg_footprint_sqft",
  "usecode", "usedesc", "zoningcode", "zoningdesc",
  "lbcs_activity_desc", "lbcs_function_desc", "lbcs_structure_desc",
  "lbcs_site_desc", "lbcs_ownership_desc",
  "legaldesc", "lot", "block", "book", "page", "plssdesc",
  "township", "section", "qtrsection", "range",
  "countyname", "geoid", "tractname", "centroidy", "centroidx", "lat", "lon",
  "census_block", "census_blockgroup", "census_zcta",
  "cong_dist", "state_house_dist", "state_senate_dist",
  "school_district", "school_dist_id", "path",
  "homestead_exemption", "qoz", "qoz_tract",
  "dpv_match_code", "dpv_notes",
  "updated", "address_source", "parval_source", "improv_source", "landval_source",
]);

export function mapProperties(raw: Record<string, unknown>): ParcelProperties {
  const { city: mailCity, state: mailState } = splitCityState(
    raw.ownercity,
    raw.ownerstate
  );

  const canonical: ParcelProperties = {
    PROP_ID: canonicalParcelId(raw) || "",
    PARCEL_ID_ALT: str(raw.parcelid2),
    LL_UUID: str(raw.ll_uuid),
    LL_STABLE_ID: str(raw.ll_stable_id),
    SITUS_ADDR: str(raw.parceladdr),
    SITUS_CITY: str(raw.placename || raw.parcelcity),
    SITUS_STATE: str(raw.parcelstate),
    SITUS_ZIP: str(raw.parcelzip),
    OWNER_NAME: str(raw.ownername),
    MAIL_ADDR: str(raw.owneraddr),
    MAIL_CITY: mailCity,
    MAIL_STATE: mailState,
    MAIL_ZIP: str(raw.ownerzip),
    DPV_MATCH: str(raw.dpv_match_code),
    DPV_NOTES: str(raw.dpv_notes),
    MKT_VAL: numOrStr(raw.totalvalue),
    LAND_VAL: numOrStr(raw.landvalue),
    IMPR_VAL: numOrStr(raw.imprvalue),
    AG_VAL: numOrStr(raw.agvalue),
    SALE_PRICE: numOrStr(raw.saleamt),
    SALE_DATE: str(raw.saledate),
    PRIOR_SALE_PRICE: numOrStr(raw.prior_sale_amount),
    PRIOR_SALE_DATE: str(raw.prior_sale_date),
    GIS_ACRES: numOrStr(raw.taxacres ?? raw.assdacres),
    LL_GIS_ACRES: numOrStr(raw.ll_gisacre),
    LL_GIS_SQFT: numOrStr(raw.ll_gissqft),
    CALC_AREA_SQM: numOrStr(raw.calcarea),
    YEAR_BUILT: str(raw.yearbuilt),
    BLDG_SQFT: str(raw.bldgsqft),
    NUM_BLDGS: numOrStr(raw.numbldgs),
    NUM_UNITS: numOrStr(raw.numunits),
    NUM_FLOORS: numOrStr(raw.numfloors),
    BLDG_COUNT: numOrStr(raw.ll_bldg_count),
    BLDG_FOOTPRINT_SQFT: numOrStr(raw.ll_bldg_footprint_sqft),
    BEDROOMS: numOrStr(raw.bedrooms),
    BATHROOMS: numOrStr(raw.fullbaths),
    HALF_BATHS: numOrStr(raw.halfbaths),
    LEGAL_DESC: str(raw.legaldesc),
    USE_CODE: str(raw.usecode),
    USE_DESC: str(raw.usedesc),
    ZONING_CODE: str(raw.zoningcode),
    ZONING: str(raw.zoningdesc || raw.zoningcode),
    LBCS_ACTIVITY: str(raw.lbcs_activity_desc),
    LBCS_FUNCTION: str(raw.lbcs_function_desc),
    LBCS_STRUCTURE: str(raw.lbcs_structure_desc),
    LBCS_SITE: str(raw.lbcs_site_desc),
    LBCS_OWNERSHIP: str(raw.lbcs_ownership_desc),
    HOMESTEAD_EXEMPTION: numOrStr(raw.homestead_exemption),
    QOZ: str(raw.qoz),
    QOZ_TRACT: str(raw.qoz_tract),
    SCHOOL_DISTRICT: str(raw.school_district),
    SCHOOL_DIST_ID: str(raw.school_dist_id),
    TAX_ACCT: str(raw.taxacctnum),
    TAX_YEAR: numOrStr(raw.taxyear),
    LOT: str(raw.lot),
    BLOCK: str(raw.block),
    BOOK: str(raw.book),
    PAGE: str(raw.page),
    SUBDIVISION: str(raw.plssdesc),
    TOWNSHIP: str(raw.township),
    SECTION: str(raw.section),
    QTR_SECTION: str(raw.qtrsection),
    RANGE: str(raw.range),
    COUNTY: str(raw.countyname),
    COUNTY_FIPS: str(raw.geoid),
    CITY: str(raw.placename || raw.parcelcity),
    CENSUS_TRACT: str(raw.tractname),
    CENSUS_BLOCK: str(raw.census_block),
    CENSUS_BLOCKGROUP: str(raw.census_blockgroup),
    CENSUS_ZCTA: str(raw.census_zcta),
    CONG_DIST: str(raw.cong_dist),
    STATE_HOUSE_DIST: str(raw.state_house_dist),
    STATE_SENATE_DIST: str(raw.state_senate_dist),
    PLACE_NAME: str(raw.placename),
    JURISDICTION_PATH: str(raw.path),
    LATITUDE: numOrStr(raw.lat ?? raw.centroidy),
    LONGITUDE: numOrStr(raw.lon ?? raw.centroidx),
    LAST_UPDATED: str(raw.updated),
    ADDRESS_SOURCE: str(raw.address_source),
    PARVAL_SOURCE: str(raw.parval_source),
    IMPROV_SOURCE: str(raw.improv_source),
    LANDVAL_SOURCE: str(raw.landval_source),
  };

  for (const [k, v] of Object.entries(raw || {})) {
    if (CANONICAL_CONSUMED.has(k)) continue;
    if (v === "" || v === null || v === undefined) continue;
    const key = String(k).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!(key in canonical)) canonical[key] = numOrStr(v);
  }

  return canonical;
}

export function resolveParcelDisplayAddress(properties: ParcelProperties): {
  title: string;
  subtitle: string;
  fullAddress: string;
  hasStreetAddress: boolean;
} {
  const street = str(properties.SITUS_ADDR);
  const city = str(properties.SITUS_CITY || properties.CITY || properties.PLACE_NAME);
  const state = str(properties.SITUS_STATE);
  const zip = str(properties.SITUS_ZIP);
  const subtitle = [city, state, zip].filter(Boolean).join(", ");
  const hasStreetAddress = Boolean(street);
  const title = street || subtitle || str(properties.PROP_ID) || "Parcel";
  const fullAddress = [street, subtitle].filter(Boolean).join(", ");
  return { title, subtitle, fullAddress, hasStreetAddress };
}

export type ParcelPopupView = {
  parcelId: string;
  lat: number;
  lng: number;
  address: string;
  addressSubtitle: string;
  ownerName: string;
  age: number | null;
  ownerOccupied: "Yes" | "No" | null;
  assessorDataLimited: boolean;
  loading?: boolean;
};

export type SelectedParcel = {
  id: string;
  lat: number;
  lng: number;
  address: string;
  properties: ParcelProperties;
  lrid?: string;
};
