import { buildIndex } from "./src/indexer.ts";

// Test against pi's own codebase or this project
const cwd = process.argv[2] || process.cwd();

console.log(`Indexing: ${cwd}`);
console.time("index");

try {
  const index = await buildIndex(cwd, {
    onProgress(processed, total) {
      if (processed % 100 === 0 || processed === total) {
        process.stdout.write(`\r  ${processed}/${total} files...`);
      }
    },
  });

  console.log("");
  console.timeEnd("index");
  console.log(`\nSymbols: ${index.symbolCount}`);
  console.log(`Files: ${index.fileCount}`);
  console.log(`Languages:`, [...index.languages.entries()].map(([l, c]) => `${l}(${c})`).join(", "));

  console.log("\n--- code_map ---");
  console.log(index.map());

  console.log("\n--- code_search: 'create' ---");
  console.log(
    index.search("create", { limit: 10 }).map(
      (s) => `${s.kind.padEnd(10)} ${s.parent ? s.parent + "." : ""}${s.name}  ${s.file}:${s.line}${s.exported ? "  exported" : ""}`,
    ).join("\n"),
  );

  // Test outline on first file that has symbols
  const firstFile = index.search("", { limit: 1 })[0]?.file;
  if (firstFile) {
    console.log(`\n--- code_outline: '${firstFile}' ---`);
    console.log(index.outline(firstFile));
  }
} catch (e) {
  console.error("Error:", e);
}
