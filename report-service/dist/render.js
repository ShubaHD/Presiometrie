import fs from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
export async function loadTemplateConfig(templatesRoot, folder) {
    const raw = await fs.readFile(path.join(templatesRoot, folder, "config.json"), "utf-8");
    return JSON.parse(raw);
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
];
export async function renderUcsHtml(templatesRoot, folder, payload, _config) {
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
