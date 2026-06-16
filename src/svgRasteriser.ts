import * as fs from "fs";
import * as path from "path";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

// Resolve the bundled WASM binary and font so the action stays self-contained:
// GitHub runs the committed dist/ bundle with no node_modules, so build.mjs
// copies these assets next to dist/index.js. Two resolution strategies cover
// both runtimes:
//   1. The bundled action: assets sit beside the entrypoint (__dirname). In the
//      ESM bundle, `__dirname` and `require` are provided by the esbuild banner
//      (see build.mjs).
//   2. Tests / unbundled execution: assets are resolved from node_modules via
//      require.resolve.
// The first existing path wins, so the same source works in both worlds.
function resolveAsset(adjacentName: string, modulePath: string): string {
  const adjacent = path.join(__dirname, adjacentName);
  if (fs.existsSync(adjacent)) {
    return adjacent;
  }
  return require.resolve(modulePath);
}

const WASM_ASSET = (): string =>
  resolveAsset("index_bg.wasm", "@resvg/resvg-wasm/index_bg.wasm");
const FONT_ASSET = (): string =>
  resolveAsset("DejaVuSans.ttf", "dejavu-fonts-ttf/ttf/DejaVuSans.ttf");

// resvg's WASM module must be initialised exactly once before any Resvg
// instance is created. Cache the promise so concurrent callers share a single
// initialisation and repeated renders do not re-init (which would throw). The
// initialisation is wrapped so a failure to locate/read the bundled WASM asset
// (or a rejected initWasm) surfaces an actionable error instead of a bare
// fs failure. The cache is cleared on failure so a later call can retry rather
// than being stuck on a poisoned promise.
let resvgInit: Promise<void> | undefined;

function ensureResvgInitialised(): Promise<void> {
  if (resvgInit === undefined) {
    resvgInit = (async () => {
      try {
        const wasm = fs.readFileSync(WASM_ASSET());
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
    labelFontBuffer = fs.readFileSync(FONT_ASSET());
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
