// Edge-shared re-export of the identity signing utility.
// Keeping a single canonical implementation in src/lib/identity/signing.ts
// avoids drift; Deno can import the .ts file directly at runtime.
export * from "../../../src/lib/identity/signing.ts";
