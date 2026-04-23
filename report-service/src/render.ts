import fs from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import type { ReportPayload } from "./payload.js";

export interface TemplateConfig {
  templateCode: string;
  version: string;
  sections: string[];
}

export async function loadTemplateConfig(templatesRoot: string, folder: string): Promise<TemplateConfig> {
  const raw = await fs.readFile(path.join(templatesRoot, folder, "config.json"), "utf-8");
  return JSON.parse(raw) as TemplateConfig;
}

const PARTIAL_FILES = [
  "header",
  "footer",
  "sample_info",
  "test_conditions",
  "iso_17892_7_mandatory",
  "point_load_structured",
  "plt_astm_figures",
  "specimen_photos",
  "measurements_table",
  "results_table",
  "ucs_charts",
  "observations",
  "signatures",
] as const;

export async function renderUcsHtml(
  templatesRoot: string,
  folder: string,
  payload: ReportPayload,
  _config: TemplateConfig,
): Promise<string> {
  const partialsDir = path.join(templatesRoot, "shared", "partials");
  for (const n of PARTIAL_FILES) {
    const p = path.join(partialsDir, `${n}.hbs`);
    const src = await fs.readFile(p, "utf-8");
    Handlebars.registerPartial(n, src);
  }

  const baseCss = await fs.readFile(path.join(templatesRoot, "shared", "styles", "base.css"), "utf-8");
  const extraCss = await fs.readFile(path.join(templatesRoot, folder, "style.css"), "utf-8");
  const tplSrc = await fs.readFile(path.join(templatesRoot, folder, "template.hbs"), "utf-8");
  const tpl = Handlebars.compile(tplSrc);

  return tpl({
    ...payload,
    charts: payload.charts ?? {},
    combinedCss: `${baseCss}\n${extraCss}`,
  });
}
