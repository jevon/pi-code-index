import { dirname, relative, sep } from "node:path";
import type { CodeIndex, SearchOptions, Symbol, SymbolKind } from "./types.ts";

export function createCodeIndex(
  symbols: Symbol[],
  languageFileCounts: Map<string, number>,
): CodeIndex {
  // Build lookup structures
  const byName = new Map<string, Symbol[]>(); // exact name → symbols
  const byNameLower = new Map<string, Symbol[]>(); // lowercase name → symbols
  const byFile = new Map<string, Symbol[]>(); // file → symbols
  const sortedNames: string[] = []; // sorted unique names for prefix search
  const nameSet = new Set<string>();

  for (const sym of symbols) {
    // By name (exact)
    if (!byName.has(sym.name)) byName.set(sym.name, []);
    byName.get(sym.name)!.push(sym);

    // By name (lowercase)
    const lower = sym.name.toLowerCase();
    if (!byNameLower.has(lower)) byNameLower.set(lower, []);
    byNameLower.get(lower)!.push(sym);

    // By file
    if (!byFile.has(sym.file)) byFile.set(sym.file, []);
    byFile.get(sym.file)!.push(sym);

    nameSet.add(sym.name);
  }

  sortedNames.push(...[...nameSet].sort());

  // Count unique files
  const fileCount = byFile.size;

  function applyFilters(results: Symbol[], options?: SearchOptions): Symbol[] {
    let filtered = results;
    if (options?.kind) {
      filtered = filtered.filter((s) => s.kind === options.kind);
    }
    if (options?.scope) {
      const scope = options.scope;
      filtered = filtered.filter((s) => s.file.startsWith(scope));
    }
    if (options?.exported !== undefined) {
      filtered = filtered.filter((s) => s.exported === options.exported);
    }
    return filtered.slice(0, options?.limit ?? 20);
  }

  function search(query: string, options?: SearchOptions): Symbol[] {
    const limit = options?.limit ?? 20;

    // 1. Exact match
    const exact = byName.get(query);
    if (exact && exact.length > 0) {
      const filtered = applyFilters(exact, { ...options, limit });
      if (filtered.length > 0) return filtered;
    }

    // 2. Case-insensitive exact match
    const lower = query.toLowerCase();
    const caseInsensitive = byNameLower.get(lower);
    if (caseInsensitive && caseInsensitive.length > 0) {
      const filtered = applyFilters(caseInsensitive, { ...options, limit });
      if (filtered.length > 0) return filtered;
    }

    // 3. Prefix match
    const prefixResults: Symbol[] = [];
    for (const name of sortedNames) {
      if (name.toLowerCase().startsWith(lower)) {
        const syms = byName.get(name);
        if (syms) prefixResults.push(...syms);
      }
      if (prefixResults.length > limit * 3) break; // gather enough for filtering
    }
    if (prefixResults.length > 0) {
      const filtered = applyFilters(prefixResults, { ...options, limit });
      if (filtered.length > 0) return filtered;
    }

    // 4. Substring / camelCase match
    const substringResults: Symbol[] = [];
    for (const name of sortedNames) {
      if (name.toLowerCase().includes(lower)) {
        const syms = byName.get(name);
        if (syms) substringResults.push(...syms);
      }
      if (substringResults.length > limit * 3) break;
    }
    return applyFilters(substringResults, { ...options, limit });
  }

  function outline(path: string, depth: number = 1): string {
    // Check if it's a file
    const fileSymbols = byFile.get(path);
    if (fileSymbols) {
      return formatFileOutline(path, fileSymbols);
    }

    // It's a directory — show files with their top-level exports
    const normalizedPath = path.endsWith("/") ? path : path + "/";
    const lines: string[] = [normalizedPath];

    const dirFiles = new Map<string, Symbol[]>();
    for (const [file, syms] of byFile) {
      if (file.startsWith(normalizedPath)) {
        const relPath = file.slice(normalizedPath.length);
        // Respect depth
        const parts = relPath.split(sep);
        if (parts.length <= depth) {
          dirFiles.set(file, syms);
        }
      }
    }

    // Sort files
    const sortedFiles = [...dirFiles.keys()].sort();
    for (const file of sortedFiles) {
      const syms = dirFiles.get(file)!;
      const topLevel = syms
        .filter((s) => !s.parent && s.exported)
        .map((s) => s.name);
      const relFile = file.slice(normalizedPath.length);
      if (topLevel.length > 0) {
        const names = topLevel.slice(0, 8).join(", ");
        const more = topLevel.length > 8 ? `, +${topLevel.length - 8} more` : "";
        lines.push(`  ${relFile}  — ${names}${more}`);
      } else {
        const count = syms.length;
        lines.push(`  ${relFile}  — ${count} symbol${count !== 1 ? "s" : ""}`);
      }
    }

    if (sortedFiles.length === 0) {
      lines.push("  (no indexed files found)");
    }

    return lines.join("\n");
  }

  function formatFileOutline(file: string, syms: Symbol[]): string {
    const lines: string[] = [file];
    // Separate top-level from nested
    const topLevel = syms.filter((s) => !s.parent);
    const nested = syms.filter((s) => s.parent);

    // Group nested by parent
    const byParent = new Map<string, Symbol[]>();
    for (const s of nested) {
      if (!byParent.has(s.parent!)) byParent.set(s.parent!, []);
      byParent.get(s.parent!)!.push(s);
    }

    for (const s of topLevel) {
      const exp = s.exported ? "  exported" : "";
      const sig = s.signature ? s.signature : "";
      lines.push(`  ${s.kind} ${s.name}${sig}${exp}`);

      // Show children
      const children = byParent.get(s.name);
      if (children) {
        for (const child of children) {
          const childSig = child.signature ? child.signature : "";
          lines.push(`    ${child.kind} ${child.name}${childSig}`);
        }
      }
    }

    return lines.join("\n");
  }

  function map(path?: string, depth: number = 2): string {
    const lines: string[] = [];

    // Header
    const langList = [...languageFileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang}(${count})`)
      .join(" ");
    lines.push(`Files: ${fileCount} indexed | Symbols: ${symbols.length} | Languages: ${langList}`);
    lines.push("");

    // Build directory tree
    const prefix = path ? (path.endsWith("/") ? path : path + "/") : "";
    const dirStats = new Map<string, { files: number; exports: string[]; totalSymbols: number }>();

    for (const [file, syms] of byFile) {
      if (prefix && !file.startsWith(prefix)) continue;

      const relFile = prefix ? file.slice(prefix.length) : file;
      const parts = relFile.split(sep);

      // Build directory path at each level up to depth
      for (let d = 1; d <= Math.min(parts.length - 1, depth); d++) {
        const dirPath = parts.slice(0, d).join(sep) + "/";
        if (!dirStats.has(dirPath)) {
          dirStats.set(dirPath, { files: 0, exports: [], totalSymbols: 0 });
        }
        const stats = dirStats.get(dirPath)!;
        // Only count files at this exact directory level check
        if (d === Math.min(parts.length - 1, depth) || parts.length - 1 < depth) {
          stats.files++;
          stats.totalSymbols += syms.length;
          const exported = syms.filter((s) => s.exported && !s.parent).map((s) => s.name);
          stats.exports.push(...exported);
        }
      }
    }

    // Also handle root-level files
    let rootFiles = 0;
    for (const [file] of byFile) {
      if (prefix && !file.startsWith(prefix)) continue;
      const relFile = prefix ? file.slice(prefix.length) : file;
      if (!relFile.includes(sep)) rootFiles++;
    }

    // Sort and display
    const sortedDirs = [...dirStats.keys()].sort();
    for (const dir of sortedDirs) {
      const stats = dirStats.get(dir)!;
      const uniqueExports = [...new Set(stats.exports)];
      const indent = "  ".repeat((dir.split(sep).length - 1));

      if (uniqueExports.length > 0) {
        const names = uniqueExports.slice(0, 6).join(", ");
        const more = uniqueExports.length > 6 ? `, +${uniqueExports.length - 6} more` : "";
        lines.push(`${indent}${dir.split(sep).pop()?.replace("/", "") || dir}/ — ${stats.files} files, ${uniqueExports.length} exports (${names}${more})`);
      } else {
        lines.push(`${indent}${dir.split(sep).pop()?.replace("/", "") || dir}/ — ${stats.files} files`);
      }
    }

    if (rootFiles > 0) {
      lines.push(`(${rootFiles} root-level files)`);
    }

    return lines.join("\n");
  }

  return {
    symbolCount: symbols.length,
    fileCount,
    languages: languageFileCounts,
    search,
    outline,
    map,
  };
}
