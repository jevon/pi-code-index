import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import Parser from "web-tree-sitter";
import { getLanguageConfig, getWasmPath } from "./languages.ts";
import { getExtractor } from "./extractors/index.ts";
import { createCodeIndex } from "./code-index.ts";
import type { CodeIndex, Symbol } from "./types.ts";

let parserInitialized = false;

async function ensureParserInit(): Promise<void> {
  if (parserInitialized) return;

  // Locate the tree-sitter.wasm file
  const wasmPath = join(
    new URL(".", import.meta.url).pathname,
    "..",
    "node_modules",
    "web-tree-sitter",
    "tree-sitter.wasm"
  );

  await Parser.init({
    locateFile: () => wasmPath,
  });
  parserInitialized = true;
}

export interface BuildIndexOptions {
  onProgress?: (processed: number, total: number) => void;
}

export async function buildIndex(
  cwd: string,
  options?: BuildIndexOptions,
): Promise<CodeIndex> {
  await ensureParserInit();

  // 1. Discover files via git
  let files: string[];
  try {
    const output = execSync("git ls-files --cached --others --exclude-standard", {
      cwd,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large repos
      encoding: "utf-8",
    });
    files = output.split("\n").filter(Boolean);
  } catch {
    // Fallback: not a git repo, this tool needs git
    throw new Error("Not a git repository. code_index requires a git repo for file discovery.");
  }

  // 2. Group by language
  const byLanguage = new Map<string, string[]>();
  const languageFileCounts = new Map<string, number>();

  for (const file of files) {
    const ext = extname(file);
    const config = getLanguageConfig(ext);
    if (!config) continue;

    if (!byLanguage.has(config.language)) {
      byLanguage.set(config.language, []);
    }
    byLanguage.get(config.language)!.push(file);
    languageFileCounts.set(
      config.language,
      (languageFileCounts.get(config.language) ?? 0) + 1,
    );
  }

  // 3. Load grammars and parse
  const allSymbols: Symbol[] = [];
  let totalFiles = 0;
  for (const files of byLanguage.values()) totalFiles += files.length;
  let processed = 0;

  for (const [language, langFiles] of byLanguage) {
    const extractor = getExtractor(language);
    if (!extractor) continue;

    // Find wasm file for this language
    const firstFile = langFiles[0];
    const ext = extname(firstFile);
    const config = getLanguageConfig(ext);
    if (!config) continue;

    // Load language grammar
    const wasmPath = getWasmPath(config.wasmFile);
    let lang: Parser.Language;
    try {
      lang = await Parser.Language.load(wasmPath);
    } catch (e) {
      // Skip languages where grammar fails to load
      processed += langFiles.length;
      continue;
    }

    const parser = new Parser();
    parser.setLanguage(lang);

    // Parse files in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < langFiles.length; i += BATCH_SIZE) {
      const batch = langFiles.slice(i, i + BATCH_SIZE);

      for (const file of batch) {
        try {
          const source = readFileSync(join(cwd, file), "utf-8");
          // Skip very large files (>500KB) - likely generated
          if (source.length > 500_000) {
            processed++;
            continue;
          }
          const tree = parser.parse(source);
          const symbols = extractor.extract(tree, source, file);
          allSymbols.push(...symbols);
          tree.delete();
        } catch {
          // Skip files that can't be read or parsed
        }
        processed++;
      }

      // Report progress
      options?.onProgress?.(processed, totalFiles);

      // Yield to event loop between batches
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    parser.delete();
  }

  return createCodeIndex(allSymbols, languageFileCounts);
}
