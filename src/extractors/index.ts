import type { SymbolExtractor } from "./base.ts";
import { typescriptExtractor } from "./typescript.ts";
import { javascriptExtractor } from "./javascript.ts";
import { pythonExtractor } from "./python.ts";
import { goExtractor } from "./go.ts";
import { rustExtractor } from "./rust.ts";
import { rubyExtractor } from "./ruby.ts";

// Language name → extractor
const extractors: Record<string, SymbolExtractor> = {
  typescript: typescriptExtractor,
  tsx: typescriptExtractor,
  javascript: javascriptExtractor,
  python: pythonExtractor,
  go: goExtractor,
  rust: rustExtractor,
  ruby: rubyExtractor,
};

export function getExtractor(language: string): SymbolExtractor | undefined {
  return extractors[language];
}

export type { SymbolExtractor } from "./base.ts";
