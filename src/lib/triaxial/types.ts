export type TriaxialSampleMeta = {
  id: string;
  diameterMm: number;
  heightMm: number;
  sigma3Mpa: number;
};

export type RawTable = {
  headers: string[];
  rows: Array<Record<string, number | string | null | undefined>>;
};

export type ChannelMapping = {
  time?: string;
  load: string; // kN
  lvdta: string; // mm
  pressure?: string; // MPa (optional if sigma3Mpa provided)
  strainAxial6?: string; // µε
  strainAxial7?: string; // µε
  strainHoop8?: string; // µε
};

export type QcFlag = "valid" | "suspect" | "invalid";

export type QcChannelResult = {
  channel: string;
  flag: QcFlag;
  reasons: string[];
  firstBadIndex: number | null;
};

export type TriaxialDerivedPoint = {
  i: number;
  t?: number;
  loadKn: number;
  lvdtaMm: number;
  sigma3Mpa: number;
  sigma1Mpa: number;
  qMpa: number;
  epsAxialFromLvdta?: number;
  epsAxialFromGauges?: number;
  epsHoop?: number;
};

export type ElasticFit = {
  startIndex: number;
  endIndex: number;
  eGpa: number | null;
  nu: number | null;
  source: {
    axial: "gauges" | "lvdta";
    radial: "hoop8" | "none";
  };
  notes: string[];
};

export type StrengthPoint = {
  sampleId: string;
  sigma3Mpa: number;
  sigma1PeakMpa: number;
  peakIndex: number;
};

export type McFit = {
  phiDeg: number | null;
  cMpa: number | null;
  m: number | null;
  bMpa: number | null;
  notes: string[];
};

export type TriaxialResult = {
  meta: TriaxialSampleMeta;
  mapping: ChannelMapping;
  qc: {
    channels: QcChannelResult[];
    chosenAxial: "gauges" | "lvdta";
    chosenRadial: "hoop8" | "none";
    notes: string[];
  };
  series: TriaxialDerivedPoint[];
  strength: StrengthPoint | null;
  elastic: ElasticFit | null;
};

