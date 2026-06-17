// Verifies that a failure to initialise the resvg WASM renderer surfaces an
// actionable error and does not poison the init cache. Uses an isolated module
// registry with a mocked @resvg/resvg-wasm so the real WASM module (exercised in
// rasteriseSvg.test.ts) is not affected.

describe("rasteriseSvgToPng error handling", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("wraps an initWasm failure in an actionable error", async () => {
    const initWasm = jest.fn().mockRejectedValue(new Error("boom"));
    jest.doMock("@resvg/resvg-wasm", () => ({
      initWasm,
      Resvg: jest.fn(),
    }));

    const { rasteriseSvgToPng } = await import("./svgRasteriser");

    await expect(rasteriseSvgToPng("<svg/>")).rejects.toThrow(
      /Failed to initialise the resvg WASM renderer: boom/,
    );
  });

  it("retries initialisation after a previous failure", async () => {
    const initWasm = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(undefined);
    const render = jest.fn(() => ({
      asPng: jest.fn(() => Buffer.from("fake-png-data")),
    }));
    jest.doMock("@resvg/resvg-wasm", () => ({
      initWasm,
      Resvg: jest.fn().mockImplementation(() => ({ render })),
    }));

    const { rasteriseSvgToPng } = await import("./svgRasteriser");

    await expect(rasteriseSvgToPng("<svg/>")).rejects.toThrow(/transient/);
    await expect(rasteriseSvgToPng("<svg/>")).resolves.toBeInstanceOf(Buffer);
    expect(initWasm).toHaveBeenCalledTimes(2);
  });
});
