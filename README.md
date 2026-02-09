# pi-code-index

Tree-sitter powered code-aware search for [pi](https://github.com/badlogic/pi-mono). Gives the LLM a structural map of your codebase so it can navigate large repos efficiently instead of blindly grepping.

## What it does

Indexes all code symbols (functions, classes, types, methods, interfaces, enums) using tree-sitter WASM parsers, then exposes three tools to the model:

| Tool | Purpose |
|------|---------|
| `code_map` | Bird's-eye overview — directory structure, file counts, key exports |
| `code_search` | Find symbols by name — exact, prefix, and substring matching |
| `code_outline` | Show structure of a file or directory without reading the full content |

The model uses `code_map` to orient, `code_search` to find definitions, and `code_outline` to understand modules — replacing dozens of `find`/`grep`/`read` calls with a few targeted lookups.

## Install

```bash
pi install git:github.com/jevon/pi-code-index
```

Or try it without installing:

```bash
pi -e git:github.com/jevon/pi-code-index
```

## Supported Languages

TypeScript, TSX, JavaScript, JSX, Python, Go, Rust. More can be added easily — just create an extractor in `src/extractors/`.

Available WASM grammars (via `tree-sitter-wasms`): bash, C, C#, C++, CSS, Dart, Elixir, Elm, Go, HTML, Java, JavaScript, JSON, Kotlin, Lua, Objective-C, OCaml, PHP, Python, Ruby, Rust, Scala, Swift, TOML, TSX, TypeScript, Vue, YAML, Zig.

## Performance

| Repo size | Index time | Memory |
|-----------|-----------|--------|
| ~200 files | ~500ms | ~5MB |
| ~10K files | ~10-15s | ~100MB |

Indexes on session start (non-blocking). Use `/reindex` to rebuild.

## Tools

### `code_map`

```
Files: 207 indexed | Symbols: 633 | Languages: tsx(184) typescript(23) javascript(2)

  src/app/ — 12 files, 24 exports (getChooseToolPrompt, getCommentPrompt, ...)
  src/components/ — 183 files, 280 exports (MyBlockElement, MyTextBlockElement, ...)
  src/hooks/ — 5 files, 9 exports (useDebounce, useIsTouchDevice, ...)
  src/lib/ — 6 files, 23 exports (DocumentMeta, listDocuments, createDocument, ...)
```

### `code_search`

```
code_search("create")

function   createDocument           src/lib/documents.ts:38     exported
function   createProvider           src/app/api/pi/command/route.ts:26
function   createSession            src/lib/pi/session-manager.ts:33
```

Supports filters: `kind`, `scope` (path prefix), `exported`, `limit`.

### `code_outline`

For a file — shows symbols with hierarchy:
```
code_outline("src/lib/documents.ts")

src/lib/documents.ts
  interface DocumentMeta  exported
  function listDocuments(): Promise<DocumentMeta[]>  exported
  function createDocument(title: string): Promise<string>  exported
  function getDocument(id: string): Promise<Document>  exported
```

For a directory — shows files with their exports:
```
code_outline("src/lib/")

src/lib/
  documents.ts  — DocumentMeta, listDocuments, createDocument, getDocument, ...
  pi/session-manager.ts  — createSession, getSession, ...
```

## How it works

1. **File discovery** via `git ls-files` (respects `.gitignore`)
2. **Parse** each file with web-tree-sitter (WASM, no native deps)
3. **Extract symbols** using language-specific AST walkers
4. **Build in-memory index** (Maps for O(1) lookups, sorted array for prefix search)

No SQLite, no persistence, no language servers. Rebuilds from scratch each session in seconds.

## Adding a language

1. Create `src/extractors/yourlang.ts` implementing the `SymbolExtractor` interface
2. Register it in `src/extractors/index.ts`
3. Add the file extension mapping in `src/languages.ts`

See `src/extractors/python.ts` for a simple example.

## License

MIT
