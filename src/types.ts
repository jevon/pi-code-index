export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "type"
  | "interface"
  | "variable"
  | "module"
  | "enum";

export interface Symbol {
  name: string;
  kind: SymbolKind;
  file: string; // relative to cwd
  line: number; // 1-indexed
  signature?: string; // e.g., "(req: Request, res: Response): Promise<User>"
  parent?: string; // enclosing class/module name
  exported: boolean;
}

export interface SearchOptions {
  kind?: SymbolKind;
  scope?: string; // file path prefix filter
  exported?: boolean;
  limit?: number;
}

export interface CodeIndex {
  symbolCount: number;
  fileCount: number;
  languages: Map<string, number>; // language name → file count

  search(query: string, options?: SearchOptions): Symbol[];
  outline(path: string, depth?: number): string;
  map(path?: string, depth?: number): string;
}
