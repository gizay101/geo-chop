/** A point in a country's normalised map space (longest side = 1, y points down). */
export type Pt = { x: number; y: number };

/** A chop line through two points. It is treated as infinite. */
export type ChopLine = { a: Pt; b: Pt };

export type City = { name: string; pop: number; x: number; y: number };

/** One country's game data, as baked by the pipeline. */
export type CountryPack = {
  iso: string;
  name: string;
  /** True while the population is synthetic prototype data. */
  placeholder: boolean;
  population: number;
  width: number;
  height: number;
  /** SVG path string in normalised coordinates. */
  outline: string;
  /** Flat [x0, y0, x1, y1, ...] rings (outer rings and holes). */
  rings: number[][];
  /** Flat [x, y, weight, ...] weighted population points used for scoring. */
  points: number[];
  cities: City[];
};
