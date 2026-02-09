import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// --- Cache ---

interface CacheData {
  version: 1;
  hash: string;
  symbols: Symbol[];
  languages: [string, number][];
}

const CACHE_VERSION = 1;

function getCachePath(cwd: string): string {
  return join(cwd, ".pi", "code-index-cache.json");
}

function computeRepoHash(cwd: string): string {
  const hash = createHash("sha256");

  // HEAD commit covers all committed changes
  try {
    const head = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" }).trim();
    hash.update(head);
  } catch {
    hash.update("no-head");
  }

  // Porcelain status covers uncommitted/staged/untracked changes
  try {
    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    hash.update(status);
  } catch {
    hash.update("no-status");
  }

  return hash.digest("hex");
}

function loadCache(cwd: string, hash: string): CacheData | null {
  const cachePath = getCachePath(cwd);
  try {
    if (!existsSync(cachePath)) return null;
    const raw = readFileSync(cachePath, "utf-8");
    const data: CacheData = JSON.parse(raw);
    if (data.version !== CACHE_VERSION || data.hash !== hash) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(cwd: string, hash: string, symbols: Symbol[], languages: Map<string, number>): void {
  const cachePath = getCachePath(cwd);
  const data: CacheData = {
    version: CACHE_VERSION,
    hash,
    symbols,
    languages: [...languages.entries()],
  };
  try {
    const dir = join(cwd, ".pi");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(data));
  } catch {
    // Non-fatal: caching is best-effort
  }
}

// --- Build ---

export interface BuildIndexOptions {
  onProgress?: (processed: number, total: number) => void;
  noCache?: boolean;
}

export async function buildIndex(
  cwd: string,
  options?: BuildIndexOptions,
): Promise<CodeIndex> {
  // 1. Check cache first (fast — only needs git rev-parse + git status)
  let hash: string;
  try {
    hash = computeRepoHash(cwd);
  } catch {
    throw new Error("Not a git repository. code_index requires a git repo for file discovery.");
  }

  if (!options?.noCache) {
    const cached = loadCache(cwd, hash);
    if (cached) {
      const languageFileCounts = new Map<string, number>(cached.languages);
      return createCodeIndex(cached.symbols, languageFileCounts);
    }
  }

  // 2. Discover files via git (only on cache miss)
  let files: string[];
  try {
    const output = execSync("git ls-files --cached --others --exclude-standard", {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
      encoding: "utf-8",
    });
    files = output.split("\n").filter(Boolean);
  } catch {
    throw new Error("Not a git repository. code_index requires a git repo for file discovery.");
  }

  // 3. Full index build
  await ensureParserInit();

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

  const allSymbols: Symbol[] = [];
  let totalFiles = 0;
  for (const files of byLanguage.values()) totalFiles += files.length;
  let processed = 0;

  for (const [language, langFiles] of byLanguage) {
    const extractor = getExtractor(language);
    if (!extractor) continue;

    const firstFile = langFiles[0];
    const ext = extname(firstFile);
    const config = getLanguageConfig(ext);
    if (!config) continue;

    const wasmPath = getWasmPath(config.wasmFile);
    let lang: Parser.Language;
    try {
      lang = await Parser.Language.load(wasmPath);
    } catch (e) {
      processed += langFiles.length;
      continue;
    }

    const parser = new Parser();
    parser.setLanguage(lang);

    const BATCH_SIZE = 100;
    for (let i = 0; i < langFiles.length; i += BATCH_SIZE) {
      const batch = langFiles.slice(i, i + BATCH_SIZE);

      for (const file of batch) {
        try {
          const source = readFileSync(join(cwd, file), "utf-8");
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

      options?.onProgress?.(processed, totalFiles);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    parser.delete();
  }

  // 4. Save cache
  saveCache(cwd, hash, allSymbols, languageFileCounts);

  return createCodeIndex(allSymbols, languageFileCounts);
}
