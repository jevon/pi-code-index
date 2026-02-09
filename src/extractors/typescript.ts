import type Parser from "web-tree-sitter";
import type { Symbol } from "../types.ts";
import { extractSignature, fieldText, findParentName, isExported, walkTree, type SymbolExtractor } from "./base.ts";

const CLASS_PARENT_TYPES = ["class_declaration", "class", "abstract_class_declaration"];

export const typescriptExtractor: SymbolExtractor = {
  extract(tree, source, file) {
    return walkTree(tree.rootNode, {
      // function myFunc() {}
      function_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "function",
          file,
          line: node.startPosition.row + 1,
          signature: extractSignature(node),
          exported: isExported(node),
        };
      },

      // const myFunc = () => {} or const myFunc = function() {}
      // Also handles: const x = 123
      lexical_declaration(node) {
        const symbols: Symbol[] = [];
        for (const child of node.namedChildren) {
          if (child.type !== "variable_declarator") continue;
          const name = fieldText(child, "name");
          if (!name) continue;

          const value = child.childForFieldName("value");
          if (!value) continue;

          const isFunc =
            value.type === "arrow_function" ||
            value.type === "function_expression" ||
            value.type === "function";

          symbols.push({
            name,
            kind: isFunc ? "function" : "variable",
            file,
            line: node.startPosition.row + 1,
            signature: isFunc ? extractSignature(value) : undefined,
            exported: isExported(node),
          });
        }
        return symbols;
      },

      // class MyClass {}
      class_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "class",
          file,
          line: node.startPosition.row + 1,
          exported: isExported(node),
        };
      },

      // abstract class MyClass {}
      abstract_class_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "class",
          file,
          line: node.startPosition.row + 1,
          exported: isExported(node),
        };
      },

      // Methods inside classes
      method_definition(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        const parent = findParentName(node, CLASS_PARENT_TYPES);
        return {
          name,
          kind: "method",
          file,
          line: node.startPosition.row + 1,
          signature: extractSignature(node),
          parent,
          exported: false, // methods aren't directly exported
        };
      },

      // interface MyInterface {}
      interface_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "interface",
          file,
          line: node.startPosition.row + 1,
          exported: isExported(node),
        };
      },

      // type MyType = ...
      type_alias_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "type",
          file,
          line: node.startPosition.row + 1,
          exported: isExported(node),
        };
      },

      // enum MyEnum {}
      enum_declaration(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "enum",
          file,
          line: node.startPosition.row + 1,
          exported: isExported(node),
        };
      },
    });
  },
};
