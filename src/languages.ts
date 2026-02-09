import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extension → { language name, wasm file name }
export interface LanguageConfig {
  language: string;
  wasmFile: string;
  queryFile: string;
}

const LANGUAGE_MAP: Record<string, LanguageConfig> = {
  ".ts": { language: "typescript", wasmFile: "tree-sitter-typescript.wasm", queryFile: "typescript.ts" },
  ".tsx": { language: "tsx", wasmFile: "tree-sitter-tsx.wasm", queryFile: "typescript.ts" },
  ".js": { language: "javascript", wasmFile: "tree-sitter-javascript.wasm", queryFile: "javascript.ts" },
  ".mjs": { language: "javascript", wasmFile: "tree-sitter-javascript.wasm", queryFile: "javascript.ts" },
  ".cjs": { language: "javascript", wasmFile: "tree-sitter-javascript.wasm", queryFile: "javascript.ts" },
  ".jsx": { language: "javascript", wasmFile: "tree-sitter-javascript.wasm", queryFile: "javascript.ts" },
  ".py": { language: "python", wasmFile: "tree-sitter-python.wasm", queryFile: "python.ts" },
  ".go": { language: "go", wasmFile: "tree-sitter-go.wasm", queryFile: "go.ts" },
  ".rs": { language: "rust", wasmFile: "tree-sitter-rust.wasm", queryFile: "rust.ts" },
  ".rb": { language: "ruby", wasmFile: "tree-sitter-ruby.wasm", queryFile: "ruby.ts" },
  ".java": { language: "java", wasmFile: "tree-sitter-java.wasm", queryFile: "java.ts" },
  ".c": { language: "c", wasmFile: "tree-sitter-c.wasm", queryFile: "c.ts" },
  ".h": { language: "c", wasmFile: "tree-sitter-c.wasm", queryFile: "c.ts" },
  ".cpp": { language: "cpp", wasmFile: "tree-sitter-cpp.wasm", queryFile: "cpp.ts" },
  ".hpp": { language: "cpp", wasmFile: "tree-sitter-cpp.wasm", queryFile: "cpp.ts" },
  ".cc": { language: "cpp", wasmFile: "tree-sitter-cpp.wasm", queryFile: "cpp.ts" },
  ".cs": { language: "csharp", wasmFile: "tree-sitter-c_sharp.wasm", queryFile: "csharp.ts" },
  ".swift": { language: "swift", wasmFile: "tree-sitter-swift.wasm", queryFile: "swift.ts" },
  ".kt": { language: "kotlin", wasmFile: "tree-sitter-kotlin.wasm", queryFile: "kotlin.ts" },
  ".lua": { language: "lua", wasmFile: "tree-sitter-lua.wasm", queryFile: "lua.ts" },
  ".zig": { language: "zig", wasmFile: "tree-sitter-zig.wasm", queryFile: "zig.ts" },
};

export function getLanguageConfig(ext: string): LanguageConfig | undefined {
  return LANGUAGE_MAP[ext];
}

export function getWasmPath(wasmFile: string): string {
  return join(__dirname, "..", "node_modules", "tree-sitter-wasms", "out", wasmFile);
}

export function getAllLanguages(): string[] {
  const seen = new Set<string>();
  for (const config of Object.values(LANGUAGE_MAP)) {
    seen.add(config.language);
  }
  return [...seen];
}
