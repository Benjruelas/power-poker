export type GeocodeSuggestion = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  /** Optional secondary line (e.g. address under owner name). */
  subtitle?: string;
  kind?: "address" | "owner" | "parcel" | "coord";
  /** LandRecords parcel id when known. */
  lrid?: string;
};
