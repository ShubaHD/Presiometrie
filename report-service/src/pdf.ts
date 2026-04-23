import puppeteer from "puppeteer";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage();
    // Vercel/Railway environments can have slow external assets (fonts/images).
    // Prefer a bounded wait and a higher timeout over the default 30s navigation timeout.
    page.setDefaultNavigationTimeout(120_000);
    page.setDefaultTimeout(120_000);
    await page.setContent(html, { waitUntil: ["domcontentloaded", "networkidle2"], timeout: 120_000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width: 100%; padding: 0 12mm; font-size: 8.5pt; color: #555;">
          <div style="display: flex; justify-content: flex-end;">
            <span>Pagina <span class="pageNumber"></span> din <span class="totalPages"></span></span>
          </div>
        </div>
      `,
      margin: { top: "14mm", bottom: "18mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
