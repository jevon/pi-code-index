import type Parser from "web-tree-sitter";
import type { Symbol } from "../types.ts";
import { extractSignature, fieldText, findParentName, walkTree, type SymbolExtractor } from "./base.ts";

export const pythonExtractor: SymbolExtractor = {
  extract(tree, source, file) {
    return walkTree(tree.rootNode, {
      function_definition(node) {
        const name = fieldText(node, "name");
        if (!name || name.startsWith("_")) return null; // skip private by convention

        const parent = findParentName(node, ["class_definition"]);
        const isMethod = !!parent;

        // Extract parameters
        const params = node.childForFieldName("parameters");
        const returnType = node.childForFieldName("return_type");
        let signature: string | undefined;
        if (params) {
          signature = params.text;
          if (returnType) signature += " -> " + returnType.text;
          if (signature.length > 120) signature = signature.slice(0, 117) + "...";
        }

        return {
          name,
          kind: isMethod ? "method" : "function",
          file,
          line: node.startPosition.row + 1,
          signature,
          parent,
          // Python: top-level symbols without leading _ are "exported"
          exported: !isMethod && !name.startsWith("_"),
        };
      },

      class_definition(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "class",
          file,
          line: node.startPosition.row + 1,
          exported: !name.startsWith("_"),
        };
      },
    });
  },
};
