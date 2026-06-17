import { rasteriseSvgToPng } from "./svgRasteriser";

// These tests deliberately use the REAL resvg-wasm module (no jest.mock) so they
// exercise the bundled-font code path end to end. They guard against the
// regression where treemap labels disappeared because resvg's font-less WASM
// runtime silently dropped every <text> element.

const WIDTH = 200;
const HEIGHT = 60;

function svg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>` +
    body +
    `</svg>`
  );
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("rasteriseSvgToPng", () => {
  it("produces a valid PNG", async () => {
    const png = await rasteriseSvgToPng(svg(""));

    expect(png.length).toBeGreaterThan(0);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it("renders text labels instead of dropping them", async () => {
    const blank = await rasteriseSvgToPng(svg(""));
    const withLabel = await rasteriseSvgToPng(
      svg(
        `<text x="10" y="35" font-family="Arial, sans-serif" font-size="24px" fill="black">Coverage</text>`,
      ),
    );

    // If the font were missing, resvg would drop the <text> and the labelled
    // image would be byte-identical to the blank white canvas.
    expect(withLabel).not.toEqual(blank);
  });
});
