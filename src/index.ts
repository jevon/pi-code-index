import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { buildIndex } from "./indexer.ts";
import type { CodeIndex } from "./types.ts";

export default function (pi: ExtensionAPI) {
  let index: CodeIndex | null = null;
  let indexing = false;
  let indexError: string | null = null;

  // Build index on session start
  pi.on("session_start", async (_event, ctx) => {
    indexing = true;
    indexError = null;
    ctx.ui.setStatus("code-index", "⏳ Indexing...");

    try {
      const start = Date.now();
      index = await buildIndex(ctx.cwd, {
        onProgress(processed, total) {
          ctx.ui.setStatus(
            "code-index",
            `⏳ Indexing ${processed}/${total} files...`,
          );
        },
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      ctx.ui.setStatus(
        "code-index",
        `✓ ${index.symbolCount} symbols in ${index.fileCount} files (${elapsed}s)`,
      );
      // Clear status after a few seconds
      setTimeout(() => ctx.ui.setStatus("code-index", undefined), 5000);
    } catch (e) {
      indexError = e instanceof Error ? e.message : String(e);
      ctx.ui.setStatus("code-index", `✗ Index failed: ${indexError}`);
    }
    indexing = false;
  });

  function getIndexOrError(): { index: CodeIndex } | { error: string } {
    if (index) return { index };
    if (indexing) return { error: "Index is still building. Try again in a moment." };
    if (indexError) return { error: `Index failed: ${indexError}` };
    return { error: "No index available. Are you in a git repository?" };
  }

  // --- code_search tool ---
  pi.registerTool({
    name: "code_search",
    label: "Code Search",
    description:
      "Find symbol definitions (functions, classes, types, methods, interfaces, enums) by name. " +
      "Supports exact, case-insensitive, prefix, and substring matching. " +
      "Use this BEFORE grep or read when looking for where something is defined.",
    parameters: Type.Object({
      query: Type.String({ description: "Symbol name or pattern to search for" }),
      kind: Type.Optional(
        Type.String({
          description:
            'Filter by kind: "function", "class", "method", "type", "interface", "variable", "enum", "module"',
        }),
      ),
      scope: Type.Optional(
        Type.String({ description: 'File path prefix filter, e.g. "src/api/"' }),
      ),
      exported: Type.Optional(
        Type.Boolean({ description: "Only show exported/public symbols" }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)" }),
      ),
    }),
    async execute(_id, params) {
      const result = getIndexOrError();
      if ("error" in result) {
        return { content: [{ type: "text", text: result.error }] };
      }

      const results = result.index.search(params.query, {
        kind: params.kind as any,
        scope: params.scope,
        exported: params.exported,
        limit: params.limit ?? 20,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No symbols found matching "${params.query}"`,
            },
          ],
        };
      }

      const lines = results.map((s) => {
        const exp = s.exported ? "  exported" : "";
        const sig = s.signature ? s.signature : "";
        const parent = s.parent ? `${s.parent}.` : "";
        return `${s.kind.padEnd(10)} ${parent}${s.name}${sig}  ${s.file}:${s.line}${exp}`;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { resultCount: results.length },
      };
    },
  });

  // --- code_outline tool ---
  pi.registerTool({
    name: "code_outline",
    label: "Code Outline",
    description:
      "Show the structure of a file (all symbols with hierarchy) or " +
      "directory (files with their top-level exports). " +
      "Use this to understand what a module contains WITHOUT reading the full file.",
    parameters: Type.Object({
      path: Type.String({ description: "File or directory path" }),
      depth: Type.Optional(
        Type.Number({ description: "For directories: how many levels deep (default 1)" }),
      ),
    }),
    async execute(_id, params) {
      const result = getIndexOrError();
      if ("error" in result) {
        return { content: [{ type: "text", text: result.error }] };
      }

      const text = result.index.outline(params.path, params.depth ?? 1);
      return { content: [{ type: "text", text }] };
    },
  });

  // --- code_map tool ---
  pi.registerTool({
    name: "code_map",
    label: "Code Map",
    description:
      "Get a bird's-eye overview of the codebase: directory structure, " +
      "file counts, languages, and key exports per directory. " +
      "Use this FIRST when orienting in an unfamiliar codebase.",
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: "Subtree to map (default: repo root)" }),
      ),
      depth: Type.Optional(
        Type.Number({ description: "Directory depth (default 2)" }),
      ),
    }),
    async execute(_id, params) {
      const result = getIndexOrError();
      if ("error" in result) {
        return { content: [{ type: "text", text: result.error }] };
      }

      const text = result.index.map(params.path, params.depth ?? 2);
      return { content: [{ type: "text", text }] };
    },
  });

  // --- reindex command ---
  pi.registerCommand("reindex", {
    description: "Rebuild the code index",
    handler: async (_args, ctx) => {
      if (indexing) {
        ctx.ui.notify("Index is already building", "warning");
        return;
      }
      indexing = true;
      index = null;
      indexError = null;
      ctx.ui.setStatus("code-index", "⏳ Reindexing...");

      try {
        const start = Date.now();
        index = await buildIndex(ctx.cwd, {
          onProgress(processed, total) {
            ctx.ui.setStatus(
              "code-index",
              `⏳ Reindexing ${processed}/${total} files...`,
            );
          },
        });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        ctx.ui.notify(
          `Indexed ${index.symbolCount} symbols in ${index.fileCount} files (${elapsed}s)`,
          "info",
        );
        ctx.ui.setStatus("code-index", undefined);
      } catch (e) {
        indexError = e instanceof Error ? e.message : String(e);
        ctx.ui.notify(`Index failed: ${indexError}`, "error");
        ctx.ui.setStatus("code-index", `✗ ${indexError}`);
      }
      indexing = false;
    },
  });
}
