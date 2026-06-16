// Bundles the action into a single self-contained ESM file at dist/index.js.
//
// esbuild is used instead of ncc because the @actions/* dependencies are now
// ESM-only and expose only the "import" condition in their package exports,
// which ncc's CommonJS resolver cannot follow. esbuild honours those exports
// and emits ESM natively.
//
// Runtime shims are injected via the banner so CommonJS-style constructs in the
// bundled dependencies (and our own asset loading) work inside the ESM output:
//   - `require`: some dependencies (e.g. tunnel) call it dynamically, and our
//     svgRasteriser falls back to require.resolve. It does not exist in ESM.
//   - `__dirname`: svgRasteriser loads the WASM/font assets relative to the
//     bundle. esbuild only shims __dirname inside bundled CommonJS modules, not
//     in our transpiled source, and one dependency (resvg-wasm) declares its own
//     top-level `__filename`, so a global `const __filename` would collide.
//     Instead we `define` the `__dirname` token in our source to a uniquely
//     named banner constant.
import { build } from "esbuild";
import { createRequire } from "module";
import { cp, mkdir, rm, writeFile } from "fs/promises";
import path from "path";

const require = createRequire(import.meta.url);
const outDir = "dist";

const banner = [
  "import { createRequire as __coveragemapCreateRequire } from 'module';",
  "import { fileURLToPath as __coveragemapFileURLToPath } from 'url';",
  "import { dirname as __coveragemapDirnameOf } from 'path';",
  "const require = __coveragemapCreateRequire(import.meta.url);",
  "const __coveragemapDirname = __coveragemapDirnameOf(__coveragemapFileURLToPath(import.meta.url));",
].join("\n");

// Start from a clean directory so stale artifacts never linger in the committed
// bundle (the check-dist CI job compares the rebuilt output against git).
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: path.join(outDir, "index.js"),
  sourcemap: true,
  banner: { js: banner },
  // Replace the bare `__dirname` in our source (valid under the CommonJS test
  // runtime) with the banner-provided ESM equivalent. esbuild renames any
  // dependency's own `__dirname` (e.g. to `__dirname2`) before this runs, so
  // only our source is affected.
  define: { __dirname: "__coveragemapDirname" },
  logLevel: "info",
  // ESM is supplied by the banner shims; keep the bundle self-contained.
  legalComments: "linked",
});

// Copy the runtime assets next to the bundle so svgRasteriser.ts can load them
// from __dirname without a node_modules tree. This keeps the action hermetic:
// GitHub runs the committed dist/ directory with no node_modules.
const assets = [
  [require.resolve("@resvg/resvg-wasm/index_bg.wasm"), "index_bg.wasm"],
  [require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"), "DejaVuSans.ttf"],
];

for (const [from, to] of assets) {
  await cp(from, path.join(outDir, to));
}

// The root package.json has no "type" field (the source is CommonJS for the
// test runtime), so mark the bundle directory as ESM. This lets Node load the
// emitted dist/index.js as an ES module without renaming it to .mjs, keeping
// the action.yaml entrypoint (dist/index.js) stable.
await writeFile(
  path.join(outDir, "package.json"),
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
);

console.log(`Bundled action and assets into ${outDir}/`);
