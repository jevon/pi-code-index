// JavaScript extractor reuses TypeScript extractor - the AST node types
// are the same for the subset of JS that matters (functions, classes, etc.)
export { typescriptExtractor as javascriptExtractor } from "./typescript.ts";
