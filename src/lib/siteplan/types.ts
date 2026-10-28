import type {
  Feature,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";

export type ObjectShape =
  | "rectangle"
  | "circle"
  | "polygon"
  | "line"
  | "polyline";

export type ObjectTypeStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** For lines/polylines: dashed stroke in the legend/map. */
  dashed?: boolean;
  /** Dotted centerline color; falls back to stroke. */
  dashColor?: string;
  /** Corridor / shape outline color; falls back to stroke. */
  borderColor?: string;
  /** Corridor / shape outline width in screen px (0 = none). */
  borderWidth?: number;
};

export type ObjectType = {
  id: string;
  name: string;
  shape: ObjectShape;
  fill: string;
  stroke: string;
  /** Hairline fallback in screen px when no to-scale width is set. */
  strokeWidth: number;
  /** Solid vs dotted/dashed stroke for lines & outlines. */
  dashed?: boolean;
  /** Dotted centerline color; falls back to stroke. */
  dashColor?: string;
  /** Corridor / shape outline color; falls back to stroke. */
  borderColor?: string;
  /** Corridor / shape outline width in screen px (0 = none). */
  borderWidth?: number;
  /**
   * Rect/circle: default footprint width (ft).
   * Line/polyline: to-scale stroke weight (ft).
   */
  widthFt: number | null;
  /** Rect/circle: default footprint height (ft). Unused for lines. */
  heightFt: number | null;
  /** Default: show centered label on instances. */
  showLabel: boolean;
  /** Optional label plate fill for placed instances of this type. */
  labelBackgroundColor?: string | null;
  /** Optional label text color when a plate is used. */
  labelColor?: string | null;
  /** Include in auto legend when at least one instance exists. */
  legend: boolean;
  /** Optional second line under the type name in the legend. */
  legendSubtitle?: string | null;
};

export type InstanceStyleOverride = Partial<ObjectTypeStyle>;

export type SitePlanInstance = {
  id: string;
  /** Null = freehand shape not tied to a library type. */
  typeId: string | null;
  geometry: Geometry;
  rotationDeg: number;
  /**
   * Rect/circle footprint width, or line/polyline to-scale weight (ft).
   */
  widthFt: number | null;
  heightFt: number | null;
  labelOverride: string | null;
  showLabel: boolean;
  /** When set, centered label draws on a filled plate (HTML marker). */
  labelBackgroundColor?: string | null;
  /** Text color for plated labels; defaults to dark slate. */
  labelColor?: string | null;
  styleOverride: InstanceStyleOverride | null;
  /**
   * Include this instance in the auto legend even without a library type.
   * Typed instances still follow their type's `legend` flag unless this is set.
   */
  legend?: boolean;
  /** Primary legend line (falls back to labelOverride / type name). */
  legendTitle?: string | null;
  /** Secondary legend line under the title. */
  legendSubtitle?: string | null;
  /**
   * Shared id for grouped objects. Null = not in a group.
   * Selecting any member selects the whole group.
   */
  groupId?: string | null;
  /**
   * Nesting under `groupId`, outer → inner (excludes `groupId` itself).
   * Set when grouping existing groups so align/distribute can move
   * child groups as rigid units instead of scattering members.
   */
  groupNest?: string[];
};

/** Mirror axis for flip transforms. */
export type FlipAxis = "horizontal" | "vertical";

export type FreeLabel = {
  id: string;
  text: string;
  position: Position;
  fontSize: number;
  /** Text / font color. */
  color: string;
  /** Label plate background for readability. */
  backgroundColor: string;
};

/** Ground-true scale bar anchored on the map (length in feet). */
export type ScaleBar = {
  id: string;
  /** Left / start anchor in lng/lat. */
  position: Position;
  /** Drawn length on the ground (feet). */
  lengthFt: number;
  /** Caption units. */
  units: "ft" | "m" | "both";
};

/** Which parcel side to square parallel to the bottom of the viewport. */
export type ParcelSquareSide = "north" | "south" | "east" | "west";

export type SitePlanView = {
  /** Cardinal side of the parcel aligned to the bottom of the map. */
  squareSide: ParcelSquareSide | null;
  /** Map bearing (degrees) after squaring / manual rotation. */
  bearingDeg: number;
  /**
   * Zoom used for PDF/PNG export. Editing zoom stays free;
   * null = use whatever zoom is on screen at export time.
   */
  exportZoom: number | null;
  /** Optional center locked with exportZoom. */
  exportCenter: [number, number] | null;
};

export type SitePlanDocument = {
  version: 2;
  lrid: string;
  parcelId: string;
  address: string;
  title: string;
  subtitle: string;
  notes: string;
  parcelPolygon: Feature<Polygon> | null;
  objectTypes: ObjectType[];
  instances: SitePlanInstance[];
  freeLabels: FreeLabel[];
  scaleBars: ScaleBar[];
  view: SitePlanView;
  updatedAt: string;
};

export type SitePlanRecord = {
  id: string;
  lrid: string;
  parcelId: string;
  address: string;
  document: SitePlanDocument;
  createdAt: string;
  updatedAt: string;
};

export type LegendRow = {
  typeId: string;
  /** @deprecated use title */
  name: string;
  /** Primary legend label. */
  title: string;
  /** Secondary line (subtitle / size). */
  subtitle: string | null;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  dashColor?: string;
  borderColor?: string;
  borderWidth?: number;
  shape: ObjectShape;
  sizeLabel: string | null;
  count: number;
};

export type EditorTool =
  | "select"
  | "place"
  | "rect"
  | "circle"
  | "polygon"
  | "line"
  | "polyline"
  | "label"
  | "measure"
  | "delete";

/** Prefill values shown while a create tool is active, applied on place/draw. */
export type DrawDefaults = {
  legendTitle: string;
  legendSubtitle: string;
  labelOverride: string;
  showLabel: boolean;
  labelBackground: boolean;
  labelBackgroundColor: string;
  labelColor: string;
  legend: boolean;
  fill: string;
  stroke: string;
  borderColor: string;
  borderWidth: number;
  dashed: boolean;
  dashColor: string;
  /** Footprint / line weight (ft). Dragged size wins for rect/circle. */
  widthFt: number | null;
  heightFt: number | null;
};

/** Helpers for map hit-testing. */
export type DrawnFeatureKind = "instance" | "freeLabel" | "parcel";

export type SitePlanPoint = Point;
export type SitePlanLine = LineString;
export type SitePlanPoly = Polygon;
