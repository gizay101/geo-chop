/** A point in a country's normalised map space (longest side = 1, y points down). */
export type Pt = { x: number; y: number };

/** A chop line through two points. It is treated as infinite. */
export type ChopLine = { a: Pt; b: Pt };

export type City = { name: string; pop: number; x: number; y: number };

/** One country's game data, as baked by the pipeline. */
export type CountryPack = {
  iso: string;
  iso2: string;
  name: string;
  pack: "countries" | "islands" | "world" | "economy" | "billionaires";
  /** What the weights measure. */
  metric: "population" | "gdp" | "billionaires";
  /** Sum of all weights (people, US$ PPP, or billionaires). */
  total: number;
  /** Data attribution shown in the round. */
  source?: string;
  /** e.g. "Contiguous states": what part of the country is playable. */
  note: string | null;
  /** True while the data is synthetic prototype data. */
  placeholder: boolean;
  population: number | null;
  width: number;
  height: number;
  /** Flat [x0, y0, x1, y1, ...] rings (outer rings and holes). */
  rings: number[][];
  /** Flat [x, y, weight, ...] weighted population points used for scoring. */
  points: number[];
  cities: City[];
};
