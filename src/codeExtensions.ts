// Single source of truth for the languages treated as source code. Both the
// changeset glob patterns and the extension-based filtering fallback derive
// from this list, so the supported-language set can only ever be defined once.
// Lives in its own module (rather than on ChangesetUtils) so consumers can
// import it without being affected by test doubles that mock "./changeset".
export const CODE_LANGUAGE_EXTENSIONS = [
  "ts",
  "js",
  "tsx",
  "jsx",
  "py",
  "java",
  "cs",
  "cpp",
  "c",
  "go",
  "rs",
] as const;
