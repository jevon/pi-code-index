import type Parser from "web-tree-sitter";
import type { Symbol } from "../types.ts";
import { fieldText, walkTree, type SymbolExtractor } from "./base.ts";

export const goExtractor: SymbolExtractor = {
  extract(tree, source, file) {
    return walkTree(tree.rootNode, {
      function_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        const params = node.childForFieldName("parameters");
        const result = node.childForFieldName("result");
        let signature: string | undefined;
        if (params) {
          signature = params.text;
          if (result) signature += " " + result.text;
          if (signature.length > 120) signature = signature.slice(0, 117) + "...";
        }

        return {
          name,
          kind: "function",
          file,
          line: node.startPosition.row + 1,
          signature,
          // Go: uppercase first letter = exported
          exported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
        };
      },

      method_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        // Get receiver type as parent
        const receiver = node.childForFieldName("receiver");
        let parent: string | undefined;
        if (receiver) {
          // Extract type name from receiver like "(s *Server)"
          const text = receiver.text;
          const match = text.match(/\*?(\w+)/);
          if (match) parent = match[1];
        }

        const params = node.childForFieldName("parameters");
        const result = node.childForFieldName("result");
        let signature: string | undefined;
        if (params) {
          signature = params.text;
          if (result) signature += " " + result.text;
          if (signature.length > 120) signature = signature.slice(0, 117) + "...";
        }

        return {
          name,
          kind: "method",
          file,
          line: node.startPosition.row + 1,
          signature,
          parent,
          exported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
        };
      },

      type_declaration(node) {
        const symbols: Symbol[] = [];
        for (const child of node.namedChildren) {
          if (child.type !== "type_spec") continue;
          const name = fieldText(child, "name");
          if (!name) continue;

          const typeNode = child.childForFieldName("type");
          const isInterface = typeNode?.type === "interface_type";
          const isStruct = typeNode?.type === "struct_type";

          symbols.push({
            name,
            kind: isInterface ? "interface" : isStruct ? "class" : "type",
            file,
            line: child.startPosition.row + 1,
            exported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
          });
        }
        return symbols;
      },
    });
  },
};
