import * as fs from "fs";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

// resvg's WASM module must be initialised exactly once before any Resvg
// instance is created. Cache the promise so concurrent callers share a single
// initialisation and repeated renders do not re-init (which would throw). The
// initialisation is wrapped so a failure to locate/read the bundled WASM asset
// (or a rejected initWasm) surfaces an actionable error instead of a bare
// require.resolve/fs failure. The cache is cleared on failure so a later call
// can retry rather than being stuck on a poisoned promise.
let resvgInit: Promise<void> | undefined;

function ensureResvgInitialised(): Promise<void> {
  if (resvgInit === undefined) {
    resvgInit = (async () => {
      try {
        const wasm = fs.readFileSync(
          require.resolve("@resvg/resvg-wasm/index_bg.wasm"),
        );
        await initWasm(wasm);
      } catch (error) {
        resvgInit = undefined;
        throw new Error(
          `Failed to initialise the resvg WASM renderer: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    })();
  }
  return resvgInit;
}

// The WASM build of resvg has no access to system fonts, so any <text> in the
// SVG is silently dropped unless we hand it a font buffer. Bundle DejaVu Sans
// (a permissively licensed sans-serif) and load it lazily so the treemap
// labels actually render. Cached because the buffer never changes.
let labelFontBuffer: Buffer | undefined;

function getLabelFontBuffer(): Buffer {
  if (labelFontBuffer === undefined) {
    labelFontBuffer = fs.readFileSync(
      require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
    );
  }
  return labelFontBuffer;
}

// Family name embedded in DejaVuSans.ttf; used as the fallback family so the
// "Arial, sans-serif" requests in the SVG resolve to the bundled font.
const DEFAULT_FONT_FAMILY = "DejaVu Sans";

// Rasterise an SVG document to a PNG buffer using the WASM build of resvg. WASM
// keeps the action hermetic and bundlable (no native add-ons), which is required
// because GitHub runs the committed dist/ bundle directly. The bundled font is
// supplied explicitly because the WASM runtime has no system fonts; without it
// every <text> element (i.e. all treemap labels) would be silently dropped.
export async function rasteriseSvgToPng(svgString: string): Promise<Buffer> {
  await ensureResvgInitialised();
  return Buffer.from(
    new Resvg(svgString, {
      font: {
        fontBuffers: [getLabelFontBuffer()],
        loadSystemFonts: false,
        defaultFontFamily: DEFAULT_FONT_FAMILY,
      },
    })
      .render()
      .asPng(),
  );
}
