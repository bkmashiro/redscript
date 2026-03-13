"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../dist/diagnostics/index.js
var require_diagnostics = __commonJS({
  "../../dist/diagnostics/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiagnosticCollector = exports2.DiagnosticError = void 0;
    exports2.parseErrorMessage = parseErrorMessage;
    exports2.formatError = formatError;
    function formatSourcePointer(sourceLines, line, col) {
      const lineIdx = line - 1;
      if (lineIdx < 0 || lineIdx >= sourceLines.length) {
        return [];
      }
      const sourceLine = sourceLines[lineIdx];
      const safeCol = Math.max(1, Math.min(col, sourceLine.length + 1));
      const pointer = `  ${" ".repeat(safeCol - 1)}^`;
      return [`  ${sourceLine}`, pointer];
    }
    var DiagnosticError = class extends Error {
      constructor(kind, message, location, sourceLines) {
        super(message);
        this.name = "DiagnosticError";
        this.kind = kind;
        this.location = location;
        this.sourceLines = sourceLines;
      }
      /**
       * Format the error for display:
       * ```
       * Error: [ParseError] line 5, col 12: Expected ';' after statement
       *   5 |   let x = 42
       *                   ^ expected ';'
       * ```
       */
      format() {
        const { kind, message, location, sourceLines } = this;
        const filePart = location.file ? `${location.file}:` : "";
        const header = `Error: [${kind}] ${filePart}line ${location.line}, col ${location.col}: ${message}`;
        if (!sourceLines || sourceLines.length === 0) {
          return header;
        }
        const pointerLines = formatSourcePointer(sourceLines, location.line, location.col);
        if (pointerLines.length === 0) {
          return header;
        }
        const lineNum = String(location.line).padStart(3);
        const prefix = `${lineNum} | `;
        const sourceLine = sourceLines[location.line - 1];
        const safeCol = Math.max(1, Math.min(location.col, sourceLine.length + 1));
        const pointer = " ".repeat(prefix.length + safeCol - 1) + "^";
        const hint = message.toLowerCase().includes("expected") ? message.split(":").pop()?.trim() || "" : "";
        return [
          header,
          `${prefix}${sourceLine}`,
          `${pointer}${hint ? ` ${hint}` : ""}`
        ].join("\n");
      }
      toString() {
        return this.format();
      }
    };
    exports2.DiagnosticError = DiagnosticError;
    var DiagnosticCollector = class {
      constructor(source, filePath) {
        this.diagnostics = [];
        this.sourceLines = [];
        if (source) {
          this.sourceLines = source.split("\n");
        }
        this.filePath = filePath;
      }
      error(kind, message, line, col) {
        const diagnostic = new DiagnosticError(kind, message, { file: this.filePath, line, col }, this.sourceLines);
        this.diagnostics.push(diagnostic);
      }
      hasErrors() {
        return this.diagnostics.length > 0;
      }
      getErrors() {
        return this.diagnostics;
      }
      formatAll() {
        return this.diagnostics.map((d) => d.format()).join("\n\n");
      }
      throwFirst() {
        if (this.diagnostics.length > 0) {
          throw this.diagnostics[0];
        }
        throw new Error("No diagnostics to throw");
      }
    };
    exports2.DiagnosticCollector = DiagnosticCollector;
    function parseErrorMessage(kind, rawMessage, sourceLines, filePath) {
      const match = rawMessage.match(/at line (\d+), col (\d+)/);
      if (match) {
        const line = parseInt(match[1], 10);
        const col = parseInt(match[2], 10);
        const message = rawMessage.replace(/ at line \d+, col \d+$/, "").trim();
        return new DiagnosticError(kind, message, { file: filePath, line, col }, sourceLines);
      }
      return new DiagnosticError(kind, rawMessage, { file: filePath, line: 1, col: 1 }, sourceLines);
    }
    function formatError(error, source) {
      if (error instanceof DiagnosticError) {
        const sourceLines = source?.split("\n") ?? error.sourceLines ?? [];
        const { file, line, col } = error.location;
        const locationPart = file ? ` in ${file} at line ${line}, col ${col}` : ` at line ${line}, col ${col}`;
        const lines = [`Error${locationPart}:`];
        const pointerLines = formatSourcePointer(sourceLines, line, col);
        if (pointerLines.length > 0) {
          lines.push(...pointerLines);
        }
        lines.push(error.message);
        return lines.join("\n");
      }
      if (!source) {
        return error.message;
      }
      const parsed = parseErrorMessage("ParseError", error.message, source.split("\n"));
      return formatError(parsed, source);
    }
  }
});

// ../../dist/lexer/index.js
var require_lexer = __commonJS({
  "../../dist/lexer/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Lexer = void 0;
    var diagnostics_1 = require_diagnostics();
    var KEYWORDS2 = {
      fn: "fn",
      let: "let",
      const: "const",
      if: "if",
      else: "else",
      while: "while",
      for: "for",
      foreach: "foreach",
      match: "match",
      return: "return",
      break: "break",
      continue: "continue",
      as: "as",
      at: "at",
      in: "in",
      is: "is",
      struct: "struct",
      impl: "impl",
      enum: "enum",
      trigger: "trigger",
      namespace: "namespace",
      execute: "execute",
      run: "run",
      unless: "unless",
      declare: "declare",
      int: "int",
      bool: "bool",
      float: "float",
      string: "string",
      void: "void",
      BlockPos: "BlockPos",
      true: "true",
      false: "false"
    };
    var SELECTOR_CHARS = /* @__PURE__ */ new Set(["a", "e", "s", "p", "r", "n"]);
    var Lexer = class {
      constructor(source, filePath) {
        this.pos = 0;
        this.line = 1;
        this.col = 1;
        this.tokens = [];
        this.source = source;
        this.sourceLines = source.split("\n");
        this.filePath = filePath;
      }
      error(message, line, col) {
        throw new diagnostics_1.DiagnosticError("LexError", message, { file: this.filePath, line: line ?? this.line, col: col ?? this.col }, this.sourceLines);
      }
      tokenize() {
        while (!this.isAtEnd()) {
          this.scanToken();
        }
        this.tokens.push({ kind: "eof", value: "", line: this.line, col: this.col });
        return this.tokens;
      }
      isAtEnd() {
        return this.pos >= this.source.length;
      }
      peek(offset = 0) {
        const idx = this.pos + offset;
        if (idx >= this.source.length)
          return "\0";
        return this.source[idx];
      }
      advance() {
        const char = this.source[this.pos++];
        if (char === "\n") {
          this.line++;
          this.col = 1;
        } else {
          this.col++;
        }
        return char;
      }
      addToken(kind, value, line, col) {
        this.tokens.push({ kind, value, line, col });
      }
      scanToken() {
        const startLine = this.line;
        const startCol = this.col;
        const char = this.advance();
        if (/\s/.test(char))
          return;
        if (char === "/" && this.peek() === "/") {
          while (!this.isAtEnd() && this.peek() !== "\n") {
            this.advance();
          }
          return;
        }
        if (char === "/" && this.peek() === "*") {
          this.advance();
          while (!this.isAtEnd()) {
            if (this.peek() === "*" && this.peek(1) === "/") {
              this.advance();
              this.advance();
              break;
            }
            this.advance();
          }
          return;
        }
        if (char === "-" && this.peek() === ">") {
          this.advance();
          this.addToken("->", "->", startLine, startCol);
          return;
        }
        if (char === "=" && this.peek() === ">") {
          this.advance();
          this.addToken("=>", "=>", startLine, startCol);
          return;
        }
        if (char === "=" && this.peek() === "=") {
          this.advance();
          this.addToken("==", "==", startLine, startCol);
          return;
        }
        if (char === "!" && this.peek() === "=") {
          this.advance();
          this.addToken("!=", "!=", startLine, startCol);
          return;
        }
        if (char === "<" && this.peek() === "=") {
          this.advance();
          this.addToken("<=", "<=", startLine, startCol);
          return;
        }
        if (char === ">" && this.peek() === "=") {
          this.advance();
          this.addToken(">=", ">=", startLine, startCol);
          return;
        }
        if (char === "&" && this.peek() === "&") {
          this.advance();
          this.addToken("&&", "&&", startLine, startCol);
          return;
        }
        if (char === "|" && this.peek() === "|") {
          this.advance();
          this.addToken("||", "||", startLine, startCol);
          return;
        }
        if (char === "+" && this.peek() === "=") {
          this.advance();
          this.addToken("+=", "+=", startLine, startCol);
          return;
        }
        if (char === "-" && this.peek() === "=") {
          this.advance();
          this.addToken("-=", "-=", startLine, startCol);
          return;
        }
        if (char === "*" && this.peek() === "=") {
          this.advance();
          this.addToken("*=", "*=", startLine, startCol);
          return;
        }
        if (char === "/" && this.peek() === "=") {
          this.advance();
          this.addToken("/=", "/=", startLine, startCol);
          return;
        }
        if (char === "%" && this.peek() === "=") {
          this.advance();
          this.addToken("%=", "%=", startLine, startCol);
          return;
        }
        if (char === ":" && this.peek() === ":") {
          this.advance();
          this.addToken("::", "::", startLine, startCol);
          return;
        }
        if (char === "." && this.peek() === ".") {
          this.advance();
          let value = "..";
          while (/[0-9]/.test(this.peek())) {
            value += this.advance();
          }
          this.addToken("range_lit", value, startLine, startCol);
          return;
        }
        if (char === "~") {
          let value = "~";
          if (this.peek() === "-" || this.peek() === "+") {
            value += this.advance();
          }
          while (/[0-9]/.test(this.peek())) {
            value += this.advance();
          }
          if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
            value += this.advance();
            while (/[0-9]/.test(this.peek())) {
              value += this.advance();
            }
          }
          if (/[a-zA-Z_]/.test(this.peek())) {
            let ident = "";
            while (/[a-zA-Z0-9_]/.test(this.peek())) {
              ident += this.advance();
            }
            value += ident;
          }
          this.addToken("rel_coord", value, startLine, startCol);
          return;
        }
        if (char === "^") {
          let value = "^";
          if (this.peek() === "-" || this.peek() === "+") {
            value += this.advance();
          }
          while (/[0-9]/.test(this.peek())) {
            value += this.advance();
          }
          if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
            value += this.advance();
            while (/[0-9]/.test(this.peek())) {
              value += this.advance();
            }
          }
          this.addToken("local_coord", value, startLine, startCol);
          return;
        }
        const singleChar = [
          "+",
          "-",
          "*",
          "/",
          "%",
          "<",
          ">",
          "!",
          "=",
          "{",
          "}",
          "(",
          ")",
          "[",
          "]",
          ",",
          ";",
          ":",
          "."
        ];
        if (singleChar.includes(char)) {
          this.addToken(char, char, startLine, startCol);
          return;
        }
        if (char === "@") {
          this.scanAtToken(startLine, startCol);
          return;
        }
        if (char === "f" && this.peek() === '"') {
          this.advance();
          this.scanFString(startLine, startCol);
          return;
        }
        if (char === '"') {
          this.scanString(startLine, startCol);
          return;
        }
        if (char === "#") {
          const nextChar = this.peek();
          if (/[a-zA-Z_]/.test(nextChar)) {
            let name = "#";
            while (/[a-zA-Z0-9_]/.test(this.peek())) {
              name += this.advance();
            }
            this.addToken("mc_name", name, startLine, startCol);
            return;
          }
          this.error(`Unexpected character '#'`, startLine, startCol);
          return;
        }
        if (/[0-9]/.test(char)) {
          this.scanNumber(char, startLine, startCol);
          return;
        }
        if (/[a-zA-Z_]/.test(char)) {
          this.scanIdentifier(char, startLine, startCol);
          return;
        }
        this.error(`Unexpected character '${char}'`, startLine, startCol);
      }
      scanAtToken(startLine, startCol) {
        const nextChar = this.peek();
        const afterNext = this.peek(1);
        if (SELECTOR_CHARS.has(nextChar) && !/[a-zA-Z_0-9]/.test(afterNext)) {
          const selectorChar = this.advance();
          let value2 = "@" + selectorChar;
          if (this.peek() === "[") {
            value2 += this.scanSelectorParams();
          }
          this.addToken("selector", value2, startLine, startCol);
          return;
        }
        let value = "@";
        while (/[a-zA-Z_0-9]/.test(this.peek())) {
          value += this.advance();
        }
        if (this.peek() === "(") {
          value += this.advance();
          let parenDepth = 1;
          while (!this.isAtEnd() && parenDepth > 0) {
            const c = this.advance();
            value += c;
            if (c === "(")
              parenDepth++;
            if (c === ")")
              parenDepth--;
          }
        }
        this.addToken("decorator", value, startLine, startCol);
      }
      scanSelectorParams() {
        let result = this.advance();
        let depth = 1;
        let braceDepth = 0;
        while (!this.isAtEnd() && depth > 0) {
          const c = this.advance();
          result += c;
          if (c === "{")
            braceDepth++;
          else if (c === "}")
            braceDepth--;
          else if (c === "[" && braceDepth === 0)
            depth++;
          else if (c === "]" && braceDepth === 0)
            depth--;
        }
        return result;
      }
      scanString(startLine, startCol) {
        let value = "";
        let interpolationDepth = 0;
        let interpolationString = false;
        while (!this.isAtEnd()) {
          if (interpolationDepth === 0 && this.peek() === '"') {
            break;
          }
          if (this.peek() === "\\" && this.peek(1) === '"') {
            this.advance();
            value += this.advance();
            continue;
          }
          if (interpolationDepth === 0 && this.peek() === "$" && this.peek(1) === "{") {
            value += this.advance();
            value += this.advance();
            interpolationDepth = 1;
            interpolationString = false;
            continue;
          }
          const char = this.advance();
          value += char;
          if (interpolationDepth === 0)
            continue;
          if (char === '"') {
            interpolationString = !interpolationString;
            continue;
          }
          if (interpolationString)
            continue;
          if (char === "{")
            interpolationDepth++;
          if (char === "}")
            interpolationDepth--;
        }
        if (this.isAtEnd()) {
          this.error(`Unterminated string`, startLine, startCol);
        }
        this.advance();
        this.addToken("string_lit", value, startLine, startCol);
      }
      scanFString(startLine, startCol) {
        let value = "";
        let interpolationDepth = 0;
        let interpolationString = false;
        while (!this.isAtEnd()) {
          if (interpolationDepth === 0 && this.peek() === '"') {
            break;
          }
          if (this.peek() === "\\" && this.peek(1) === '"') {
            this.advance();
            value += this.advance();
            continue;
          }
          if (interpolationDepth === 0 && this.peek() === "{") {
            value += this.advance();
            interpolationDepth = 1;
            interpolationString = false;
            continue;
          }
          const char = this.advance();
          value += char;
          if (interpolationDepth === 0)
            continue;
          if (char === '"' && this.source[this.pos - 2] !== "\\") {
            interpolationString = !interpolationString;
            continue;
          }
          if (interpolationString)
            continue;
          if (char === "{")
            interpolationDepth++;
          if (char === "}")
            interpolationDepth--;
        }
        if (this.isAtEnd()) {
          this.error("Unterminated f-string", startLine, startCol);
        }
        this.advance();
        this.addToken("f_string", value, startLine, startCol);
      }
      scanNumber(firstChar, startLine, startCol) {
        let value = firstChar;
        while (/[0-9]/.test(this.peek())) {
          value += this.advance();
        }
        if (this.peek() === "." && this.peek(1) === ".") {
          value += this.advance();
          value += this.advance();
          while (/[0-9]/.test(this.peek())) {
            value += this.advance();
          }
          this.addToken("range_lit", value, startLine, startCol);
          return;
        }
        if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
          value += this.advance();
          while (/[0-9]/.test(this.peek())) {
            value += this.advance();
          }
          const floatSuffix = this.peek().toLowerCase();
          if (floatSuffix === "f") {
            value += this.advance();
            this.addToken("float_lit", value, startLine, startCol);
            return;
          }
          if (floatSuffix === "d") {
            value += this.advance();
            this.addToken("double_lit", value, startLine, startCol);
            return;
          }
          this.addToken("float_lit", value, startLine, startCol);
          return;
        }
        const intSuffix = this.peek().toLowerCase();
        if (intSuffix === "b" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
          value += this.advance();
          this.addToken("byte_lit", value, startLine, startCol);
          return;
        }
        if (intSuffix === "s" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
          value += this.advance();
          this.addToken("short_lit", value, startLine, startCol);
          return;
        }
        if (intSuffix === "l" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
          value += this.advance();
          this.addToken("long_lit", value, startLine, startCol);
          return;
        }
        if (intSuffix === "f" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
          value += this.advance();
          this.addToken("float_lit", value, startLine, startCol);
          return;
        }
        if (intSuffix === "d" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
          value += this.advance();
          this.addToken("double_lit", value, startLine, startCol);
          return;
        }
        this.addToken("int_lit", value, startLine, startCol);
      }
      scanIdentifier(firstChar, startLine, startCol) {
        let value = firstChar;
        while (/[a-zA-Z_0-9]/.test(this.peek())) {
          value += this.advance();
        }
        if (value === "raw" && this.peek() === "(") {
          this.advance();
          while (/\s/.test(this.peek())) {
            this.advance();
          }
          if (this.peek() === '"') {
            this.advance();
            let rawContent = "";
            while (!this.isAtEnd() && this.peek() !== '"') {
              if (this.peek() === "\\" && this.peek(1) === '"') {
                this.advance();
                rawContent += this.advance();
              } else {
                rawContent += this.advance();
              }
            }
            if (this.peek() === '"') {
              this.advance();
            }
            while (/\s/.test(this.peek())) {
              this.advance();
            }
            if (this.peek() === ")") {
              this.advance();
            }
            this.addToken("raw_cmd", rawContent, startLine, startCol);
            return;
          }
        }
        const keyword = KEYWORDS2[value];
        if (keyword) {
          this.addToken(keyword, value, startLine, startCol);
        } else {
          this.addToken("ident", value, startLine, startCol);
        }
      }
    };
    exports2.Lexer = Lexer;
  }
});

// ../../dist/parser/index.js
var require_parser = __commonJS({
  "../../dist/parser/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Parser = void 0;
    var lexer_1 = require_lexer();
    var diagnostics_1 = require_diagnostics();
    var PRECEDENCE = {
      "||": 1,
      "&&": 2,
      "==": 3,
      "!=": 3,
      "<": 4,
      "<=": 4,
      ">": 4,
      ">=": 4,
      "is": 4,
      "+": 5,
      "-": 5,
      "*": 6,
      "/": 6,
      "%": 6
    };
    var BINARY_OPS = /* @__PURE__ */ new Set(["||", "&&", "==", "!=", "<", "<=", ">", ">=", "is", "+", "-", "*", "/", "%"]);
    var ENTITY_TYPE_NAMES = /* @__PURE__ */ new Set([
      "entity",
      "Player",
      "Mob",
      "HostileMob",
      "PassiveMob",
      "Zombie",
      "Skeleton",
      "Creeper",
      "Spider",
      "Enderman",
      "Pig",
      "Cow",
      "Sheep",
      "Chicken",
      "Villager",
      "ArmorStand",
      "Item",
      "Arrow"
    ]);
    function computeIsSingle(raw) {
      if (/^@[spr](\[|$)/.test(raw))
        return true;
      if (/[\[,\s]limit=1[,\]\s]/.test(raw))
        return true;
      return false;
    }
    var Parser = class _Parser {
      constructor(tokens, source, filePath) {
        this.pos = 0;
        this.tokens = tokens;
        this.sourceLines = source?.split("\n") ?? [];
        this.filePath = filePath;
      }
      // -------------------------------------------------------------------------
      // Utilities
      // -------------------------------------------------------------------------
      peek(offset = 0) {
        const idx = this.pos + offset;
        if (idx >= this.tokens.length) {
          return this.tokens[this.tokens.length - 1];
        }
        return this.tokens[idx];
      }
      advance() {
        const token = this.tokens[this.pos];
        if (token.kind !== "eof")
          this.pos++;
        return token;
      }
      check(kind) {
        return this.peek().kind === kind;
      }
      match(...kinds) {
        for (const kind of kinds) {
          if (this.check(kind)) {
            this.advance();
            return true;
          }
        }
        return false;
      }
      expect(kind) {
        const token = this.peek();
        if (token.kind !== kind) {
          throw new diagnostics_1.DiagnosticError("ParseError", `Expected '${kind}' but got '${token.kind}'`, { file: this.filePath, line: token.line, col: token.col }, this.sourceLines);
        }
        return this.advance();
      }
      error(message) {
        const token = this.peek();
        throw new diagnostics_1.DiagnosticError("ParseError", message, { file: this.filePath, line: token.line, col: token.col }, this.sourceLines);
      }
      withLoc(node, token) {
        const span = { line: token.line, col: token.col };
        Object.defineProperty(node, "span", {
          value: span,
          enumerable: false,
          configurable: true,
          writable: true
        });
        return node;
      }
      getLocToken(node) {
        const span = node.span;
        if (!span) {
          return null;
        }
        return { kind: "eof", value: "", line: span.line, col: span.col };
      }
      // -------------------------------------------------------------------------
      // Program
      // -------------------------------------------------------------------------
      parse(defaultNamespace = "redscript") {
        let namespace = defaultNamespace;
        const globals = [];
        const declarations = [];
        const structs = [];
        const implBlocks = [];
        const enums = [];
        const consts = [];
        if (this.check("namespace")) {
          this.advance();
          const name = this.expect("ident");
          namespace = name.value;
          this.expect(";");
        }
        while (!this.check("eof")) {
          if (this.check("let")) {
            globals.push(this.parseGlobalDecl(true));
          } else if (this.check("struct")) {
            structs.push(this.parseStructDecl());
          } else if (this.check("impl")) {
            implBlocks.push(this.parseImplBlock());
          } else if (this.check("enum")) {
            enums.push(this.parseEnumDecl());
          } else if (this.check("const")) {
            consts.push(this.parseConstDecl());
          } else if (this.check("declare")) {
            this.advance();
            this.parseDeclareStub();
          } else {
            declarations.push(this.parseFnDecl());
          }
        }
        return { namespace, globals, declarations, structs, implBlocks, enums, consts };
      }
      // -------------------------------------------------------------------------
      // Struct Declaration
      // -------------------------------------------------------------------------
      parseStructDecl() {
        const structToken = this.expect("struct");
        const name = this.expect("ident").value;
        this.expect("{");
        const fields = [];
        while (!this.check("}") && !this.check("eof")) {
          const fieldName = this.expect("ident").value;
          this.expect(":");
          const fieldType = this.parseType();
          fields.push({ name: fieldName, type: fieldType });
          this.match(",");
        }
        this.expect("}");
        return this.withLoc({ name, fields }, structToken);
      }
      parseEnumDecl() {
        const enumToken = this.expect("enum");
        const name = this.expect("ident").value;
        this.expect("{");
        const variants = [];
        let nextValue = 0;
        while (!this.check("}") && !this.check("eof")) {
          const variantToken = this.expect("ident");
          const variant = { name: variantToken.value };
          if (this.match("=")) {
            const valueToken = this.expect("int_lit");
            variant.value = parseInt(valueToken.value, 10);
            nextValue = variant.value + 1;
          } else {
            variant.value = nextValue++;
          }
          variants.push(variant);
          if (!this.match(",")) {
            break;
          }
        }
        this.expect("}");
        return this.withLoc({ name, variants }, enumToken);
      }
      parseImplBlock() {
        const implToken = this.expect("impl");
        const typeName = this.expect("ident").value;
        this.expect("{");
        const methods = [];
        while (!this.check("}") && !this.check("eof")) {
          methods.push(this.parseFnDecl(typeName));
        }
        this.expect("}");
        return this.withLoc({ kind: "impl_block", typeName, methods }, implToken);
      }
      parseConstDecl() {
        const constToken = this.expect("const");
        const name = this.expect("ident").value;
        let type;
        if (this.match(":")) {
          type = this.parseType();
        }
        this.expect("=");
        const value = this.parseLiteralExpr();
        this.match(";");
        const inferredType = type ?? (value.kind === "str_lit" ? { kind: "named", name: "string" } : value.kind === "bool_lit" ? { kind: "named", name: "bool" } : value.kind === "float_lit" ? { kind: "named", name: "float" } : { kind: "named", name: "int" });
        return this.withLoc({ name, type: inferredType, value }, constToken);
      }
      parseGlobalDecl(mutable) {
        const token = this.advance();
        const name = this.expect("ident").value;
        this.expect(":");
        const type = this.parseType();
        this.expect("=");
        const init = this.parseExpr();
        this.expect(";");
        return this.withLoc({ kind: "global", name, type, init, mutable }, token);
      }
      // -------------------------------------------------------------------------
      // Function Declaration
      // -------------------------------------------------------------------------
      parseFnDecl(implTypeName) {
        const decorators = this.parseDecorators();
        const fnToken = this.expect("fn");
        const name = this.expect("ident").value;
        this.expect("(");
        const params = this.parseParams(implTypeName);
        this.expect(")");
        let returnType = { kind: "named", name: "void" };
        if (this.match("->") || this.match(":")) {
          returnType = this.parseType();
        }
        const body = this.parseBlock();
        return this.withLoc({ name, params, returnType, decorators, body }, fnToken);
      }
      /** Parse a `declare fn name(params): returnType;` stub — no body, just discard. */
      parseDeclareStub() {
        this.expect("fn");
        this.expect("ident");
        this.expect("(");
        let depth = 1;
        while (!this.check("eof") && depth > 0) {
          const t = this.advance();
          if (t.kind === "(")
            depth++;
          else if (t.kind === ")")
            depth--;
        }
        if (this.match(":") || this.match("->")) {
          this.parseType();
        }
        this.match(";");
      }
      parseDecorators() {
        const decorators = [];
        while (this.check("decorator")) {
          const token = this.advance();
          const decorator = this.parseDecoratorValue(token.value);
          decorators.push(decorator);
        }
        return decorators;
      }
      parseDecoratorValue(value) {
        const match = value.match(/^@(\w+)(?:\(([^)]*)\))?$/);
        if (!match) {
          this.error(`Invalid decorator: ${value}`);
        }
        const name = match[1];
        const argsStr = match[2];
        if (!argsStr) {
          return { name };
        }
        const args = {};
        if (name === "on") {
          const eventTypeMatch = argsStr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
          if (eventTypeMatch) {
            args.eventType = eventTypeMatch[1];
            return { name, args };
          }
        }
        if (name === "on_trigger" || name === "on_advancement" || name === "on_craft" || name === "on_join_team") {
          const strMatch = argsStr.match(/^"([^"]*)"$/);
          if (strMatch) {
            if (name === "on_trigger") {
              args.trigger = strMatch[1];
            } else if (name === "on_advancement") {
              args.advancement = strMatch[1];
            } else if (name === "on_craft") {
              args.item = strMatch[1];
            } else if (name === "on_join_team") {
              args.team = strMatch[1];
            }
            return { name, args };
          }
        }
        for (const part of argsStr.split(",")) {
          const [key, val] = part.split("=").map((s) => s.trim());
          if (key === "rate") {
            args.rate = parseInt(val, 10);
          } else if (key === "trigger") {
            args.trigger = val;
          } else if (key === "advancement") {
            args.advancement = val;
          } else if (key === "item") {
            args.item = val;
          } else if (key === "team") {
            args.team = val;
          }
        }
        return { name, args };
      }
      parseParams(implTypeName) {
        const params = [];
        if (!this.check(")")) {
          do {
            const paramToken = this.expect("ident");
            const name = paramToken.value;
            let type;
            if (implTypeName && params.length === 0 && name === "self" && !this.check(":")) {
              type = { kind: "struct", name: implTypeName };
            } else {
              this.expect(":");
              type = this.parseType();
            }
            let defaultValue;
            if (this.match("=")) {
              defaultValue = this.parseExpr();
            }
            params.push(this.withLoc({ name, type, default: defaultValue }, paramToken));
          } while (this.match(","));
        }
        return params;
      }
      parseType() {
        const token = this.peek();
        let type;
        if (token.kind === "(") {
          return this.parseFunctionType();
        }
        if (token.kind === "int" || token.kind === "bool" || token.kind === "float" || token.kind === "string" || token.kind === "void" || token.kind === "BlockPos") {
          this.advance();
          type = { kind: "named", name: token.kind };
        } else if (token.kind === "ident") {
          this.advance();
          type = { kind: "struct", name: token.value };
        } else {
          this.error(`Expected type, got '${token.kind}'`);
        }
        while (this.match("[")) {
          this.expect("]");
          type = { kind: "array", elem: type };
        }
        return type;
      }
      parseFunctionType() {
        this.expect("(");
        const params = [];
        if (!this.check(")")) {
          do {
            params.push(this.parseType());
          } while (this.match(","));
        }
        this.expect(")");
        this.expect("->");
        const returnType = this.parseType();
        return { kind: "function_type", params, return: returnType };
      }
      // -------------------------------------------------------------------------
      // Block & Statements
      // -------------------------------------------------------------------------
      parseBlock() {
        this.expect("{");
        const stmts = [];
        while (!this.check("}") && !this.check("eof")) {
          stmts.push(this.parseStmt());
        }
        this.expect("}");
        return stmts;
      }
      parseStmt() {
        if (this.check("let")) {
          return this.parseLetStmt();
        }
        if (this.check("return")) {
          return this.parseReturnStmt();
        }
        if (this.check("break")) {
          const token = this.advance();
          this.match(";");
          return this.withLoc({ kind: "break" }, token);
        }
        if (this.check("continue")) {
          const token = this.advance();
          this.match(";");
          return this.withLoc({ kind: "continue" }, token);
        }
        if (this.check("if")) {
          return this.parseIfStmt();
        }
        if (this.check("while")) {
          return this.parseWhileStmt();
        }
        if (this.check("for")) {
          return this.parseForStmt();
        }
        if (this.check("foreach")) {
          return this.parseForeachStmt();
        }
        if (this.check("match")) {
          return this.parseMatchStmt();
        }
        if (this.check("as")) {
          return this.parseAsStmt();
        }
        if (this.check("at")) {
          return this.parseAtStmt();
        }
        if (this.check("execute")) {
          return this.parseExecuteStmt();
        }
        if (this.check("raw_cmd")) {
          const token = this.advance();
          const cmd = token.value;
          this.match(";");
          return this.withLoc({ kind: "raw", cmd }, token);
        }
        return this.parseExprStmt();
      }
      parseLetStmt() {
        const letToken = this.expect("let");
        const name = this.expect("ident").value;
        let type;
        if (this.match(":")) {
          type = this.parseType();
        }
        this.expect("=");
        const init = this.parseExpr();
        this.expect(";");
        return this.withLoc({ kind: "let", name, type, init }, letToken);
      }
      parseReturnStmt() {
        const returnToken = this.expect("return");
        let value;
        if (!this.check(";")) {
          value = this.parseExpr();
        }
        this.expect(";");
        return this.withLoc({ kind: "return", value }, returnToken);
      }
      parseIfStmt() {
        const ifToken = this.expect("if");
        this.expect("(");
        const cond = this.parseExpr();
        this.expect(")");
        const then = this.parseBlock();
        let else_;
        if (this.match("else")) {
          if (this.check("if")) {
            else_ = [this.parseIfStmt()];
          } else {
            else_ = this.parseBlock();
          }
        }
        return this.withLoc({ kind: "if", cond, then, else_ }, ifToken);
      }
      parseWhileStmt() {
        const whileToken = this.expect("while");
        this.expect("(");
        const cond = this.parseExpr();
        this.expect(")");
        const body = this.parseBlock();
        return this.withLoc({ kind: "while", cond, body }, whileToken);
      }
      parseForStmt() {
        const forToken = this.expect("for");
        if (this.check("ident") && this.peek(1).kind === "in") {
          return this.parseForRangeStmt(forToken);
        }
        this.expect("(");
        let init;
        if (this.check("let")) {
          const letToken = this.expect("let");
          const name = this.expect("ident").value;
          let type;
          if (this.match(":")) {
            type = this.parseType();
          }
          this.expect("=");
          const initExpr = this.parseExpr();
          const initStmt = { kind: "let", name, type, init: initExpr };
          init = this.withLoc(initStmt, letToken);
        }
        this.expect(";");
        const cond = this.parseExpr();
        this.expect(";");
        const step = this.parseExpr();
        this.expect(")");
        const body = this.parseBlock();
        return this.withLoc({ kind: "for", init, cond, step, body }, forToken);
      }
      parseForRangeStmt(forToken) {
        const varName = this.expect("ident").value;
        this.expect("in");
        const rangeToken = this.expect("range_lit");
        const range = this.parseRangeValue(rangeToken.value);
        const start = this.withLoc({ kind: "int_lit", value: range.min ?? 0 }, rangeToken);
        const end = this.withLoc({ kind: "int_lit", value: range.max ?? 0 }, rangeToken);
        const body = this.parseBlock();
        return this.withLoc({ kind: "for_range", varName, start, end, body }, forToken);
      }
      parseForeachStmt() {
        const foreachToken = this.expect("foreach");
        this.expect("(");
        const binding = this.expect("ident").value;
        this.expect("in");
        const iterable = this.parseExpr();
        this.expect(")");
        let executeContext;
        const execIdentKeywords = ["positioned", "rotated", "facing", "anchored", "align", "on", "summon"];
        if (this.check("as") || this.check("at") || this.check("in") || this.check("ident") && execIdentKeywords.includes(this.peek().value)) {
          let context = "";
          while (!this.check("{") && !this.check("eof")) {
            context += this.advance().value + " ";
          }
          executeContext = context.trim();
        }
        const body = this.parseBlock();
        return this.withLoc({ kind: "foreach", binding, iterable, body, executeContext }, foreachToken);
      }
      parseMatchStmt() {
        const matchToken = this.expect("match");
        this.expect("(");
        const expr = this.parseExpr();
        this.expect(")");
        this.expect("{");
        const arms = [];
        while (!this.check("}") && !this.check("eof")) {
          let pattern;
          if (this.check("ident") && this.peek().value === "_") {
            this.advance();
            pattern = null;
          } else {
            pattern = this.parseExpr();
          }
          this.expect("=>");
          const body = this.parseBlock();
          arms.push({ pattern, body });
        }
        this.expect("}");
        return this.withLoc({ kind: "match", expr, arms }, matchToken);
      }
      parseAsStmt() {
        const asToken = this.expect("as");
        const as_sel = this.parseSelector();
        if (this.match("at")) {
          const at_sel = this.parseSelector();
          const body2 = this.parseBlock();
          return this.withLoc({ kind: "as_at", as_sel, at_sel, body: body2 }, asToken);
        }
        const body = this.parseBlock();
        return this.withLoc({ kind: "as_block", selector: as_sel, body }, asToken);
      }
      parseAtStmt() {
        const atToken = this.expect("at");
        const selector = this.parseSelector();
        const body = this.parseBlock();
        return this.withLoc({ kind: "at_block", selector, body }, atToken);
      }
      parseExecuteStmt() {
        const executeToken = this.expect("execute");
        const subcommands = [];
        while (!this.check("run") && !this.check("eof")) {
          if (this.match("as")) {
            const selector = this.parseSelector();
            subcommands.push({ kind: "as", selector });
          } else if (this.match("at")) {
            const selector = this.parseSelector();
            subcommands.push({ kind: "at", selector });
          } else if (this.checkIdent("positioned")) {
            this.advance();
            if (this.match("as")) {
              const selector = this.parseSelector();
              subcommands.push({ kind: "positioned_as", selector });
            } else {
              const x = this.parseCoordToken();
              const y = this.parseCoordToken();
              const z = this.parseCoordToken();
              subcommands.push({ kind: "positioned", x, y, z });
            }
          } else if (this.checkIdent("rotated")) {
            this.advance();
            if (this.match("as")) {
              const selector = this.parseSelector();
              subcommands.push({ kind: "rotated_as", selector });
            } else {
              const yaw = this.parseCoordToken();
              const pitch = this.parseCoordToken();
              subcommands.push({ kind: "rotated", yaw, pitch });
            }
          } else if (this.checkIdent("facing")) {
            this.advance();
            if (this.checkIdent("entity")) {
              this.advance();
              const selector = this.parseSelector();
              const anchor = this.checkIdent("eyes") || this.checkIdent("feet") ? this.advance().value : "feet";
              subcommands.push({ kind: "facing_entity", selector, anchor });
            } else {
              const x = this.parseCoordToken();
              const y = this.parseCoordToken();
              const z = this.parseCoordToken();
              subcommands.push({ kind: "facing", x, y, z });
            }
          } else if (this.checkIdent("anchored")) {
            this.advance();
            const anchor = this.advance().value;
            subcommands.push({ kind: "anchored", anchor });
          } else if (this.checkIdent("align")) {
            this.advance();
            const axes = this.advance().value;
            subcommands.push({ kind: "align", axes });
          } else if (this.checkIdent("on")) {
            this.advance();
            const relation = this.advance().value;
            subcommands.push({ kind: "on", relation });
          } else if (this.checkIdent("summon")) {
            this.advance();
            const entity = this.advance().value;
            subcommands.push({ kind: "summon", entity });
          } else if (this.checkIdent("store")) {
            this.advance();
            const storeType = this.advance().value;
            if (this.checkIdent("score")) {
              this.advance();
              const target = this.advance().value;
              const targetObj = this.advance().value;
              if (storeType === "result") {
                subcommands.push({ kind: "store_result", target, targetObj });
              } else {
                subcommands.push({ kind: "store_success", target, targetObj });
              }
            } else {
              this.error("store currently only supports score target");
            }
          } else if (this.match("if")) {
            this.parseExecuteCondition(subcommands, "if");
          } else if (this.match("unless")) {
            this.parseExecuteCondition(subcommands, "unless");
          } else if (this.match("in")) {
            let dim = this.advance().value;
            if (this.match(":")) {
              dim += ":" + this.advance().value;
            }
            subcommands.push({ kind: "in", dimension: dim });
          } else {
            this.error(`Unexpected token in execute statement: ${this.peek().kind} (${this.peek().value})`);
          }
        }
        this.expect("run");
        const body = this.parseBlock();
        return this.withLoc({ kind: "execute", subcommands, body }, executeToken);
      }
      parseExecuteCondition(subcommands, type) {
        if (this.checkIdent("entity") || this.check("selector")) {
          if (this.checkIdent("entity"))
            this.advance();
          const selectorOrVar = this.parseSelectorOrVarSelector();
          subcommands.push({ kind: type === "if" ? "if_entity" : "unless_entity", ...selectorOrVar });
        } else if (this.checkIdent("block")) {
          this.advance();
          const x = this.parseCoordToken();
          const y = this.parseCoordToken();
          const z = this.parseCoordToken();
          const block = this.parseBlockId();
          subcommands.push({ kind: type === "if" ? "if_block" : "unless_block", pos: [x, y, z], block });
        } else if (this.checkIdent("score")) {
          this.advance();
          const target = this.advance().value;
          const targetObj = this.advance().value;
          if (this.checkIdent("matches")) {
            this.advance();
            const range = this.advance().value;
            subcommands.push({ kind: type === "if" ? "if_score_range" : "unless_score_range", target, targetObj, range });
          } else {
            const op = this.advance().value;
            const source = this.advance().value;
            const sourceObj = this.advance().value;
            subcommands.push({
              kind: type === "if" ? "if_score" : "unless_score",
              target,
              targetObj,
              op,
              source,
              sourceObj
            });
          }
        } else {
          this.error(`Unknown condition type after ${type}`);
        }
      }
      parseCoordToken() {
        const token = this.peek();
        if (token.kind === "rel_coord" || token.kind === "local_coord" || token.kind === "int_lit" || token.kind === "float_lit" || token.kind === "-" || token.kind === "ident") {
          return this.advance().value;
        }
        this.error(`Expected coordinate, got ${token.kind}`);
        return "~";
      }
      parseBlockId() {
        let id = this.advance().value;
        if (this.match(":")) {
          id += ":" + this.advance().value;
        }
        if (this.check("[")) {
          id += this.advance().value;
          while (!this.check("]") && !this.check("eof")) {
            id += this.advance().value;
          }
          id += this.advance().value;
        }
        return id;
      }
      checkIdent(value) {
        return this.check("ident") && this.peek().value === value;
      }
      parseExprStmt() {
        const expr = this.parseExpr();
        this.expect(";");
        const exprToken = this.getLocToken(expr) ?? this.peek();
        return this.withLoc({ kind: "expr", expr }, exprToken);
      }
      // -------------------------------------------------------------------------
      // Expressions (Precedence Climbing)
      // -------------------------------------------------------------------------
      parseExpr() {
        return this.parseAssignment();
      }
      parseAssignment() {
        const left = this.parseBinaryExpr(1);
        const token = this.peek();
        if (token.kind === "=" || token.kind === "+=" || token.kind === "-=" || token.kind === "*=" || token.kind === "/=" || token.kind === "%=") {
          const op = this.advance().kind;
          if (left.kind === "ident") {
            const value = this.parseAssignment();
            return this.withLoc({ kind: "assign", target: left.name, op, value }, this.getLocToken(left) ?? token);
          }
          if (left.kind === "member") {
            const value = this.parseAssignment();
            return this.withLoc({ kind: "member_assign", obj: left.obj, field: left.field, op, value }, this.getLocToken(left) ?? token);
          }
        }
        return left;
      }
      parseBinaryExpr(minPrec) {
        let left = this.parseUnaryExpr();
        while (true) {
          const op = this.peek().kind;
          if (!BINARY_OPS.has(op))
            break;
          const prec = PRECEDENCE[op];
          if (prec < minPrec)
            break;
          const opToken = this.advance();
          if (op === "is") {
            const entityType = this.parseEntityTypeName();
            left = this.withLoc({ kind: "is_check", expr: left, entityType }, this.getLocToken(left) ?? opToken);
            continue;
          }
          const right = this.parseBinaryExpr(prec + 1);
          left = this.withLoc({ kind: "binary", op, left, right }, this.getLocToken(left) ?? opToken);
        }
        return left;
      }
      parseUnaryExpr() {
        if (this.match("!")) {
          const bangToken = this.tokens[this.pos - 1];
          const operand = this.parseUnaryExpr();
          return this.withLoc({ kind: "unary", op: "!", operand }, bangToken);
        }
        if (this.check("-") && !this.isSubtraction()) {
          const minusToken = this.advance();
          const operand = this.parseUnaryExpr();
          return this.withLoc({ kind: "unary", op: "-", operand }, minusToken);
        }
        return this.parsePostfixExpr();
      }
      parseEntityTypeName() {
        const token = this.expect("ident");
        if (ENTITY_TYPE_NAMES.has(token.value)) {
          return token.value;
        }
        this.error(`Unknown entity type '${token.value}'`);
      }
      isSubtraction() {
        if (this.pos === 0)
          return false;
        const prev = this.tokens[this.pos - 1];
        return ["int_lit", "float_lit", "ident", ")", "]"].includes(prev.kind);
      }
      parsePostfixExpr() {
        let expr = this.parsePrimaryExpr();
        while (true) {
          if (this.match("(")) {
            const openParenToken = this.tokens[this.pos - 1];
            if (expr.kind === "ident") {
              const args2 = this.parseArgs();
              this.expect(")");
              expr = this.withLoc({ kind: "call", fn: expr.name, args: args2 }, this.getLocToken(expr) ?? openParenToken);
              continue;
            }
            if (expr.kind === "member") {
              const methodMap = {
                "tag": "__entity_tag",
                "untag": "__entity_untag",
                "has_tag": "__entity_has_tag",
                "push": "__array_push",
                "pop": "__array_pop",
                "add": "set_add",
                "contains": "set_contains",
                "remove": "set_remove",
                "clear": "set_clear"
              };
              const internalFn = methodMap[expr.field];
              if (internalFn) {
                const args3 = this.parseArgs();
                this.expect(")");
                expr = this.withLoc({ kind: "call", fn: internalFn, args: [expr.obj, ...args3] }, this.getLocToken(expr) ?? openParenToken);
                continue;
              }
              const args2 = this.parseArgs();
              this.expect(")");
              expr = this.withLoc({ kind: "call", fn: expr.field, args: [expr.obj, ...args2] }, this.getLocToken(expr) ?? openParenToken);
              continue;
            }
            const args = this.parseArgs();
            this.expect(")");
            expr = this.withLoc({ kind: "invoke", callee: expr, args }, this.getLocToken(expr) ?? openParenToken);
            continue;
          }
          if (this.match("[")) {
            const index = this.parseExpr();
            this.expect("]");
            expr = this.withLoc({ kind: "index", obj: expr, index }, this.getLocToken(expr) ?? this.tokens[this.pos - 1]);
            continue;
          }
          if (this.match(".")) {
            const field = this.expect("ident").value;
            expr = this.withLoc({ kind: "member", obj: expr, field }, this.getLocToken(expr) ?? this.tokens[this.pos - 1]);
            continue;
          }
          break;
        }
        return expr;
      }
      parseArgs() {
        const args = [];
        if (!this.check(")")) {
          do {
            args.push(this.parseExpr());
          } while (this.match(","));
        }
        return args;
      }
      parsePrimaryExpr() {
        const token = this.peek();
        if (token.kind === "ident" && this.peek(1).kind === "::") {
          const typeToken = this.advance();
          this.expect("::");
          const methodToken = this.expect("ident");
          this.expect("(");
          const args = this.parseArgs();
          this.expect(")");
          return this.withLoc({ kind: "static_call", type: typeToken.value, method: methodToken.value, args }, typeToken);
        }
        if (token.kind === "ident" && this.peek(1).kind === "=>") {
          return this.parseSingleParamLambda();
        }
        if (token.kind === "int_lit") {
          this.advance();
          return this.withLoc({ kind: "int_lit", value: parseInt(token.value, 10) }, token);
        }
        if (token.kind === "float_lit") {
          this.advance();
          return this.withLoc({ kind: "float_lit", value: parseFloat(token.value) }, token);
        }
        if (token.kind === "rel_coord") {
          this.advance();
          return this.withLoc({ kind: "rel_coord", value: token.value }, token);
        }
        if (token.kind === "local_coord") {
          this.advance();
          return this.withLoc({ kind: "local_coord", value: token.value }, token);
        }
        if (token.kind === "byte_lit") {
          this.advance();
          return this.withLoc({ kind: "byte_lit", value: parseInt(token.value.slice(0, -1), 10) }, token);
        }
        if (token.kind === "short_lit") {
          this.advance();
          return this.withLoc({ kind: "short_lit", value: parseInt(token.value.slice(0, -1), 10) }, token);
        }
        if (token.kind === "long_lit") {
          this.advance();
          return this.withLoc({ kind: "long_lit", value: parseInt(token.value.slice(0, -1), 10) }, token);
        }
        if (token.kind === "double_lit") {
          this.advance();
          return this.withLoc({ kind: "double_lit", value: parseFloat(token.value.slice(0, -1)) }, token);
        }
        if (token.kind === "string_lit") {
          this.advance();
          return this.parseStringExpr(token);
        }
        if (token.kind === "f_string") {
          this.advance();
          return this.parseFStringExpr(token);
        }
        if (token.kind === "mc_name") {
          this.advance();
          return this.withLoc({ kind: "mc_name", value: token.value.slice(1) }, token);
        }
        if (token.kind === "true") {
          this.advance();
          return this.withLoc({ kind: "bool_lit", value: true }, token);
        }
        if (token.kind === "false") {
          this.advance();
          return this.withLoc({ kind: "bool_lit", value: false }, token);
        }
        if (token.kind === "range_lit") {
          this.advance();
          return this.withLoc({ kind: "range_lit", range: this.parseRangeValue(token.value) }, token);
        }
        if (token.kind === "selector") {
          this.advance();
          return this.withLoc({
            kind: "selector",
            raw: token.value,
            isSingle: computeIsSingle(token.value),
            sel: this.parseSelectorValue(token.value)
          }, token);
        }
        if (token.kind === "ident") {
          this.advance();
          return this.withLoc({ kind: "ident", name: token.value }, token);
        }
        if (token.kind === "(") {
          if (this.isBlockPosLiteral()) {
            return this.parseBlockPos();
          }
          if (this.isLambdaStart()) {
            return this.parseLambdaExpr();
          }
          this.advance();
          const expr = this.parseExpr();
          this.expect(")");
          return expr;
        }
        if (token.kind === "{") {
          return this.parseStructLit();
        }
        if (token.kind === "[") {
          return this.parseArrayLit();
        }
        this.error(`Unexpected token '${token.kind}'`);
      }
      parseLiteralExpr() {
        const expr = this.parsePrimaryExpr();
        if (expr.kind === "int_lit" || expr.kind === "float_lit" || expr.kind === "bool_lit" || expr.kind === "str_lit") {
          return expr;
        }
        this.error("Const value must be a literal");
      }
      parseSingleParamLambda() {
        const paramToken = this.expect("ident");
        const params = [{ name: paramToken.value }];
        this.expect("=>");
        return this.finishLambdaExpr(params, paramToken);
      }
      parseLambdaExpr() {
        const openParenToken = this.expect("(");
        const params = [];
        if (!this.check(")")) {
          do {
            const name = this.expect("ident").value;
            let type;
            if (this.match(":")) {
              type = this.parseType();
            }
            params.push({ name, type });
          } while (this.match(","));
        }
        this.expect(")");
        let returnType;
        if (this.match("->")) {
          returnType = this.parseType();
        }
        this.expect("=>");
        return this.finishLambdaExpr(params, openParenToken, returnType);
      }
      finishLambdaExpr(params, token, returnType) {
        const body = this.check("{") ? this.parseBlock() : this.parseExpr();
        return this.withLoc({ kind: "lambda", params, returnType, body }, token);
      }
      parseStringExpr(token) {
        if (!token.value.includes("${")) {
          return this.withLoc({ kind: "str_lit", value: token.value }, token);
        }
        const parts = [];
        let current = "";
        let index = 0;
        while (index < token.value.length) {
          if (token.value[index] === "$" && token.value[index + 1] === "{") {
            if (current) {
              parts.push(current);
              current = "";
            }
            index += 2;
            let depth = 1;
            let exprSource = "";
            let inString = false;
            while (index < token.value.length && depth > 0) {
              const char = token.value[index];
              if (char === '"' && token.value[index - 1] !== "\\") {
                inString = !inString;
              }
              if (!inString) {
                if (char === "{") {
                  depth++;
                } else if (char === "}") {
                  depth--;
                  if (depth === 0) {
                    index++;
                    break;
                  }
                }
              }
              if (depth > 0) {
                exprSource += char;
              }
              index++;
            }
            if (depth !== 0) {
              this.error("Unterminated string interpolation");
            }
            parts.push(this.parseEmbeddedExpr(exprSource));
            continue;
          }
          current += token.value[index];
          index++;
        }
        if (current) {
          parts.push(current);
        }
        return this.withLoc({ kind: "str_interp", parts }, token);
      }
      parseFStringExpr(token) {
        const parts = [];
        let current = "";
        let index = 0;
        while (index < token.value.length) {
          if (token.value[index] === "{") {
            if (current) {
              parts.push({ kind: "text", value: current });
              current = "";
            }
            index++;
            let depth = 1;
            let exprSource = "";
            let inString = false;
            while (index < token.value.length && depth > 0) {
              const char = token.value[index];
              if (char === '"' && token.value[index - 1] !== "\\") {
                inString = !inString;
              }
              if (!inString) {
                if (char === "{") {
                  depth++;
                } else if (char === "}") {
                  depth--;
                  if (depth === 0) {
                    index++;
                    break;
                  }
                }
              }
              if (depth > 0) {
                exprSource += char;
              }
              index++;
            }
            if (depth !== 0) {
              this.error("Unterminated f-string interpolation");
            }
            parts.push({ kind: "expr", expr: this.parseEmbeddedExpr(exprSource) });
            continue;
          }
          current += token.value[index];
          index++;
        }
        if (current) {
          parts.push({ kind: "text", value: current });
        }
        return this.withLoc({ kind: "f_string", parts }, token);
      }
      parseEmbeddedExpr(source) {
        const tokens = new lexer_1.Lexer(source, this.filePath).tokenize();
        const parser = new _Parser(tokens, source, this.filePath);
        const expr = parser.parseExpr();
        if (!parser.check("eof")) {
          parser.error(`Unexpected token '${parser.peek().kind}' in string interpolation`);
        }
        return expr;
      }
      parseStructLit() {
        const braceToken = this.expect("{");
        const fields = [];
        if (!this.check("}")) {
          do {
            const name = this.expect("ident").value;
            this.expect(":");
            const value = this.parseExpr();
            fields.push({ name, value });
          } while (this.match(","));
        }
        this.expect("}");
        return this.withLoc({ kind: "struct_lit", fields }, braceToken);
      }
      parseArrayLit() {
        const bracketToken = this.expect("[");
        const elements = [];
        if (!this.check("]")) {
          do {
            elements.push(this.parseExpr());
          } while (this.match(","));
        }
        this.expect("]");
        return this.withLoc({ kind: "array_lit", elements }, bracketToken);
      }
      isLambdaStart() {
        if (!this.check("("))
          return false;
        let offset = 1;
        if (this.peek(offset).kind !== ")") {
          while (true) {
            if (this.peek(offset).kind !== "ident") {
              return false;
            }
            offset += 1;
            if (this.peek(offset).kind === ":") {
              offset += 1;
              const consumed = this.typeTokenLength(offset);
              if (consumed === 0) {
                return false;
              }
              offset += consumed;
            }
            if (this.peek(offset).kind === ",") {
              offset += 1;
              continue;
            }
            break;
          }
        }
        if (this.peek(offset).kind !== ")") {
          return false;
        }
        offset += 1;
        if (this.peek(offset).kind === "=>") {
          return true;
        }
        if (this.peek(offset).kind === "->") {
          offset += 1;
          const consumed = this.typeTokenLength(offset);
          if (consumed === 0) {
            return false;
          }
          offset += consumed;
          return this.peek(offset).kind === "=>";
        }
        return false;
      }
      typeTokenLength(offset) {
        const token = this.peek(offset);
        if (token.kind === "(") {
          let inner = offset + 1;
          if (this.peek(inner).kind !== ")") {
            while (true) {
              const consumed = this.typeTokenLength(inner);
              if (consumed === 0) {
                return 0;
              }
              inner += consumed;
              if (this.peek(inner).kind === ",") {
                inner += 1;
                continue;
              }
              break;
            }
          }
          if (this.peek(inner).kind !== ")") {
            return 0;
          }
          inner += 1;
          if (this.peek(inner).kind !== "->") {
            return 0;
          }
          inner += 1;
          const returnLen = this.typeTokenLength(inner);
          return returnLen === 0 ? 0 : inner + returnLen - offset;
        }
        const isNamedType = token.kind === "int" || token.kind === "bool" || token.kind === "float" || token.kind === "string" || token.kind === "void" || token.kind === "BlockPos" || token.kind === "ident";
        if (!isNamedType) {
          return 0;
        }
        let length = 1;
        while (this.peek(offset + length).kind === "[" && this.peek(offset + length + 1).kind === "]") {
          length += 2;
        }
        return length;
      }
      isBlockPosLiteral() {
        if (!this.check("("))
          return false;
        let offset = 1;
        for (let i = 0; i < 3; i++) {
          const consumed = this.coordComponentTokenLength(offset);
          if (consumed === 0)
            return false;
          offset += consumed;
          if (i < 2) {
            if (this.peek(offset).kind !== ",")
              return false;
            offset += 1;
          }
        }
        return this.peek(offset).kind === ")";
      }
      coordComponentTokenLength(offset) {
        const token = this.peek(offset);
        if (token.kind === "int_lit") {
          return 1;
        }
        if (token.kind === "-") {
          return this.peek(offset + 1).kind === "int_lit" ? 2 : 0;
        }
        if (token.kind === "rel_coord" || token.kind === "local_coord") {
          return 1;
        }
        return 0;
      }
      parseBlockPos() {
        const openParenToken = this.expect("(");
        const x = this.parseCoordComponent();
        this.expect(",");
        const y = this.parseCoordComponent();
        this.expect(",");
        const z = this.parseCoordComponent();
        this.expect(")");
        return this.withLoc({ kind: "blockpos", x, y, z }, openParenToken);
      }
      parseCoordComponent() {
        const token = this.peek();
        if (token.kind === "rel_coord") {
          this.advance();
          const offset = this.parseCoordOffsetFromValue(token.value.slice(1));
          return { kind: "relative", offset };
        }
        if (token.kind === "local_coord") {
          this.advance();
          const offset = this.parseCoordOffsetFromValue(token.value.slice(1));
          return { kind: "local", offset };
        }
        return { kind: "absolute", value: this.parseSignedCoordOffset(true) };
      }
      parseCoordOffsetFromValue(value) {
        if (value === "" || value === void 0)
          return 0;
        return parseFloat(value);
      }
      parseSignedCoordOffset(requireValue = false) {
        let sign = 1;
        if (this.match("-")) {
          sign = -1;
        }
        if (this.check("int_lit")) {
          return sign * parseInt(this.advance().value, 10);
        }
        if (requireValue) {
          this.error("Expected integer coordinate component");
        }
        return 0;
      }
      // -------------------------------------------------------------------------
      // Selector Parsing
      // -------------------------------------------------------------------------
      parseSelector() {
        const token = this.expect("selector");
        return this.parseSelectorValue(token.value);
      }
      // Parse either a selector (@a[...]) or a variable with filters (p[...])
      // Returns { selector } for selectors or { varName, filters } for variables
      parseSelectorOrVarSelector() {
        if (this.check("selector")) {
          return { selector: this.parseSelector() };
        }
        const varToken = this.expect("ident");
        const varName = varToken.value;
        if (this.check("[")) {
          this.advance();
          let filterStr = "";
          let depth = 1;
          while (depth > 0 && !this.check("eof")) {
            if (this.check("["))
              depth++;
            else if (this.check("]"))
              depth--;
            if (depth > 0) {
              filterStr += this.peek().value ?? this.peek().kind;
              this.advance();
            }
          }
          this.expect("]");
          const filters = this.parseSelectorFilters(filterStr);
          return { varName, filters };
        }
        return { varName };
      }
      parseSelectorValue(value) {
        const bracketIndex = value.indexOf("[");
        if (bracketIndex === -1) {
          return { kind: value };
        }
        const kind = value.slice(0, bracketIndex);
        const paramsStr = value.slice(bracketIndex + 1, -1);
        const filters = this.parseSelectorFilters(paramsStr);
        return { kind, filters };
      }
      parseSelectorFilters(paramsStr) {
        const filters = {};
        const parts = this.splitSelectorParams(paramsStr);
        for (const part of parts) {
          const eqIndex = part.indexOf("=");
          if (eqIndex === -1)
            continue;
          const key = part.slice(0, eqIndex).trim();
          const val = part.slice(eqIndex + 1).trim();
          switch (key) {
            case "type":
              filters.type = val;
              break;
            case "distance":
              filters.distance = this.parseRangeValue(val);
              break;
            case "tag":
              if (val.startsWith("!")) {
                filters.notTag = filters.notTag ?? [];
                filters.notTag.push(val.slice(1));
              } else {
                filters.tag = filters.tag ?? [];
                filters.tag.push(val);
              }
              break;
            case "limit":
              filters.limit = parseInt(val, 10);
              break;
            case "sort":
              filters.sort = val;
              break;
            case "nbt":
              filters.nbt = val;
              break;
            case "gamemode":
              filters.gamemode = val;
              break;
            case "scores":
              filters.scores = this.parseScoresFilter(val);
              break;
            case "x":
              filters.x = this.parseRangeValue(val);
              break;
            case "y":
              filters.y = this.parseRangeValue(val);
              break;
            case "z":
              filters.z = this.parseRangeValue(val);
              break;
            case "x_rotation":
              filters.x_rotation = this.parseRangeValue(val);
              break;
            case "y_rotation":
              filters.y_rotation = this.parseRangeValue(val);
              break;
          }
        }
        return filters;
      }
      splitSelectorParams(str) {
        const parts = [];
        let current = "";
        let depth = 0;
        for (const char of str) {
          if (char === "{" || char === "[")
            depth++;
          else if (char === "}" || char === "]")
            depth--;
          else if (char === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
          }
          current += char;
        }
        if (current.trim()) {
          parts.push(current.trim());
        }
        return parts;
      }
      parseScoresFilter(val) {
        const scores = {};
        const inner = val.slice(1, -1);
        const parts = inner.split(",");
        for (const part of parts) {
          const [name, range] = part.split("=").map((s) => s.trim());
          scores[name] = this.parseRangeValue(range);
        }
        return scores;
      }
      parseRangeValue(value) {
        if (value.startsWith("..")) {
          const max = parseInt(value.slice(2), 10);
          return { max };
        }
        if (value.endsWith("..")) {
          const min = parseInt(value.slice(0, -2), 10);
          return { min };
        }
        const dotIndex = value.indexOf("..");
        if (dotIndex !== -1) {
          const min = parseInt(value.slice(0, dotIndex), 10);
          const max = parseInt(value.slice(dotIndex + 2), 10);
          return { min, max };
        }
        const val = parseInt(value, 10);
        return { min: val, max: val };
      }
    };
    exports2.Parser = Parser;
  }
});

// ../../dist/events/types.js
var require_types = __commonJS({
  "../../dist/events/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EVENT_TYPES = void 0;
    exports2.isEventTypeName = isEventTypeName;
    exports2.getEventParamSpecs = getEventParamSpecs;
    exports2.EVENT_TYPES = {
      PlayerDeath: {
        tag: "rs.just_died",
        params: ["player: Player"],
        detection: "scoreboard"
      },
      PlayerJoin: {
        tag: "rs.just_joined",
        params: ["player: Player"],
        detection: "tag"
      },
      BlockBreak: {
        tag: "rs.just_broke_block",
        params: ["player: Player", "block: string"],
        detection: "advancement"
      },
      EntityKill: {
        tag: "rs.just_killed",
        params: ["player: Player"],
        detection: "scoreboard"
      },
      ItemUse: {
        tag: "rs.just_used_item",
        params: ["player: Player"],
        detection: "scoreboard"
      }
    };
    function isEventTypeName(value) {
      return value in exports2.EVENT_TYPES;
    }
    function getEventParamSpecs(eventType) {
      return exports2.EVENT_TYPES[eventType].params.map(parseEventParam);
    }
    function parseEventParam(spec) {
      const match = spec.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!match) {
        throw new Error(`Invalid event parameter spec: ${spec}`);
      }
      const [, name, typeName] = match;
      return {
        name,
        type: toTypeNode(typeName)
      };
    }
    function toTypeNode(typeName) {
      if (typeName === "Player") {
        return { kind: "entity", entityType: "Player" };
      }
      if (typeName === "string" || typeName === "int" || typeName === "bool" || typeName === "float" || typeName === "void" || typeName === "BlockPos" || typeName === "byte" || typeName === "short" || typeName === "long" || typeName === "double") {
        return { kind: "named", name: typeName };
      }
      return { kind: "struct", name: typeName };
    }
  }
});

// ../../dist/typechecker/index.js
var require_typechecker = __commonJS({
  "../../dist/typechecker/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeChecker = void 0;
    var diagnostics_1 = require_diagnostics();
    var types_1 = require_types();
    var ENTITY_HIERARCHY = {
      "entity": null,
      "Player": "entity",
      "Mob": "entity",
      "HostileMob": "Mob",
      "PassiveMob": "Mob",
      "Zombie": "HostileMob",
      "Skeleton": "HostileMob",
      "Creeper": "HostileMob",
      "Spider": "HostileMob",
      "Enderman": "HostileMob",
      "Pig": "PassiveMob",
      "Cow": "PassiveMob",
      "Sheep": "PassiveMob",
      "Chicken": "PassiveMob",
      "Villager": "PassiveMob",
      "ArmorStand": "entity",
      "Item": "entity",
      "Arrow": "entity"
    };
    var MC_TYPE_TO_ENTITY = {
      "zombie": "Zombie",
      "minecraft:zombie": "Zombie",
      "skeleton": "Skeleton",
      "minecraft:skeleton": "Skeleton",
      "creeper": "Creeper",
      "minecraft:creeper": "Creeper",
      "spider": "Spider",
      "minecraft:spider": "Spider",
      "enderman": "Enderman",
      "minecraft:enderman": "Enderman",
      "pig": "Pig",
      "minecraft:pig": "Pig",
      "cow": "Cow",
      "minecraft:cow": "Cow",
      "sheep": "Sheep",
      "minecraft:sheep": "Sheep",
      "chicken": "Chicken",
      "minecraft:chicken": "Chicken",
      "villager": "Villager",
      "minecraft:villager": "Villager",
      "armor_stand": "ArmorStand",
      "minecraft:armor_stand": "ArmorStand",
      "item": "Item",
      "minecraft:item": "Item",
      "arrow": "Arrow",
      "minecraft:arrow": "Arrow"
    };
    var VOID_TYPE = { kind: "named", name: "void" };
    var INT_TYPE = { kind: "named", name: "int" };
    var STRING_TYPE = { kind: "named", name: "string" };
    var FORMAT_STRING_TYPE = { kind: "named", name: "format_string" };
    var BUILTIN_SIGNATURES = {
      setTimeout: {
        params: [INT_TYPE, { kind: "function_type", params: [], return: VOID_TYPE }],
        return: VOID_TYPE
      },
      setInterval: {
        params: [INT_TYPE, { kind: "function_type", params: [], return: VOID_TYPE }],
        return: INT_TYPE
      },
      clearInterval: {
        params: [INT_TYPE],
        return: VOID_TYPE
      }
    };
    var TypeChecker = class {
      constructor(source, filePath) {
        this.functions = /* @__PURE__ */ new Map();
        this.implMethods = /* @__PURE__ */ new Map();
        this.structs = /* @__PURE__ */ new Map();
        this.enums = /* @__PURE__ */ new Map();
        this.consts = /* @__PURE__ */ new Map();
        this.currentFn = null;
        this.currentReturnType = null;
        this.scope = /* @__PURE__ */ new Map();
        this.selfTypeStack = ["entity"];
        this.richTextBuiltins = /* @__PURE__ */ new Map([
          ["say", { messageIndex: 0 }],
          ["announce", { messageIndex: 0 }],
          ["tell", { messageIndex: 1 }],
          ["tellraw", { messageIndex: 1 }],
          ["title", { messageIndex: 1 }],
          ["actionbar", { messageIndex: 1 }],
          ["subtitle", { messageIndex: 1 }]
        ]);
        this.collector = new diagnostics_1.DiagnosticCollector(source, filePath);
      }
      getNodeLocation(node) {
        const span = node?.span;
        return {
          line: span?.line ?? 1,
          col: span?.col ?? 1
        };
      }
      report(message, node) {
        const { line, col } = this.getNodeLocation(node);
        this.collector.error("TypeError", message, line, col);
      }
      /**
       * Type check a program. Returns collected errors.
       */
      check(program) {
        for (const fn of program.declarations) {
          this.functions.set(fn.name, fn);
        }
        for (const implBlock of program.implBlocks ?? []) {
          let methods = this.implMethods.get(implBlock.typeName);
          if (!methods) {
            methods = /* @__PURE__ */ new Map();
            this.implMethods.set(implBlock.typeName, methods);
          }
          for (const method of implBlock.methods) {
            const selfIndex = method.params.findIndex((param) => param.name === "self");
            if (selfIndex > 0) {
              this.report(`Method '${method.name}' must declare 'self' as the first parameter`, method.params[selfIndex]);
            }
            if (selfIndex === 0) {
              const selfType = this.normalizeType(method.params[0].type);
              if (selfType.kind !== "struct" || selfType.name !== implBlock.typeName) {
                this.report(`Method '${method.name}' has invalid 'self' type`, method.params[0]);
              }
            }
            methods.set(method.name, method);
          }
        }
        for (const struct of program.structs ?? []) {
          const fields = /* @__PURE__ */ new Map();
          for (const field of struct.fields) {
            fields.set(field.name, field.type);
          }
          this.structs.set(struct.name, fields);
        }
        for (const enumDecl of program.enums ?? []) {
          const variants = /* @__PURE__ */ new Map();
          for (const variant of enumDecl.variants) {
            variants.set(variant.name, variant.value ?? 0);
          }
          this.enums.set(enumDecl.name, variants);
        }
        for (const constDecl of program.consts ?? []) {
          const constType = this.normalizeType(constDecl.type);
          const actualType = this.inferType(constDecl.value);
          if (!this.typesMatch(constType, actualType)) {
            this.report(`Type mismatch: expected ${this.typeToString(constType)}, got ${this.typeToString(actualType)}`, constDecl.value);
          }
          this.consts.set(constDecl.name, constType);
        }
        for (const fn of program.declarations) {
          this.checkFunction(fn);
        }
        for (const implBlock of program.implBlocks ?? []) {
          for (const method of implBlock.methods) {
            this.checkFunction(method);
          }
        }
        return this.collector.getErrors();
      }
      checkFunction(fn) {
        this.currentFn = fn;
        this.currentReturnType = this.normalizeType(fn.returnType);
        this.scope = /* @__PURE__ */ new Map();
        let seenDefault = false;
        this.checkFunctionDecorators(fn);
        for (const [name, type] of this.consts.entries()) {
          this.scope.set(name, { type, mutable: false });
        }
        for (const param of fn.params) {
          this.scope.set(param.name, { type: this.normalizeType(param.type), mutable: true });
          if (param.default) {
            seenDefault = true;
            this.checkExpr(param.default);
            const defaultType = this.inferType(param.default);
            const paramType = this.normalizeType(param.type);
            if (!this.typesMatch(paramType, defaultType)) {
              this.report(`Default value for '${param.name}' must be ${this.typeToString(paramType)}, got ${this.typeToString(defaultType)}`, param.default);
            }
          } else if (seenDefault) {
            this.report(`Parameter '${param.name}' cannot follow a default parameter`, param);
          }
        }
        this.checkBlock(fn.body);
        this.currentFn = null;
        this.currentReturnType = null;
      }
      checkFunctionDecorators(fn) {
        const eventDecorators = fn.decorators.filter((decorator) => decorator.name === "on");
        if (eventDecorators.length === 0) {
          return;
        }
        if (eventDecorators.length > 1) {
          this.report(`Function '${fn.name}' cannot have multiple @on decorators`, fn);
          return;
        }
        const eventType = eventDecorators[0].args?.eventType;
        if (!eventType) {
          this.report(`Function '${fn.name}' is missing an event type in @on(...)`, fn);
          return;
        }
        if (!(0, types_1.isEventTypeName)(eventType)) {
          this.report(`Unknown event type '${eventType}'`, fn);
          return;
        }
        const expectedParams = (0, types_1.getEventParamSpecs)(eventType);
        if (fn.params.length !== expectedParams.length) {
          this.report(`Event handler '${fn.name}' for ${eventType} must declare ${expectedParams.length} parameter(s), got ${fn.params.length}`, fn);
          return;
        }
        for (let i = 0; i < expectedParams.length; i++) {
          const actual = this.normalizeType(fn.params[i].type);
          const expected = this.normalizeType(expectedParams[i].type);
          if (!this.typesMatch(expected, actual)) {
            this.report(`Event handler '${fn.name}' parameter ${i + 1} must be ${this.typeToString(expected)}, got ${this.typeToString(actual)}`, fn.params[i]);
          }
        }
      }
      checkBlock(stmts) {
        for (const stmt of stmts) {
          this.checkStmt(stmt);
        }
      }
      checkStmt(stmt) {
        switch (stmt.kind) {
          case "let":
            this.checkLetStmt(stmt);
            break;
          case "return":
            this.checkReturnStmt(stmt);
            break;
          case "if":
            this.checkExpr(stmt.cond);
            this.checkIfBranches(stmt);
            break;
          case "while":
            this.checkExpr(stmt.cond);
            this.checkBlock(stmt.body);
            break;
          case "for":
            if (stmt.init)
              this.checkStmt(stmt.init);
            this.checkExpr(stmt.cond);
            this.checkExpr(stmt.step);
            this.checkBlock(stmt.body);
            break;
          case "foreach":
            this.checkExpr(stmt.iterable);
            if (stmt.iterable.kind === "selector") {
              const entityType = this.inferEntityTypeFromSelector(stmt.iterable.sel);
              this.scope.set(stmt.binding, {
                type: { kind: "entity", entityType },
                mutable: false
                // Entity bindings are not reassignable
              });
              this.pushSelfType(entityType);
              this.checkBlock(stmt.body);
              this.popSelfType();
            } else {
              const iterableType = this.inferType(stmt.iterable);
              if (iterableType.kind === "array") {
                this.scope.set(stmt.binding, { type: iterableType.elem, mutable: true });
              } else {
                this.scope.set(stmt.binding, { type: { kind: "named", name: "void" }, mutable: true });
              }
              this.checkBlock(stmt.body);
            }
            break;
          case "match":
            this.checkExpr(stmt.expr);
            for (const arm of stmt.arms) {
              if (arm.pattern) {
                this.checkExpr(arm.pattern);
                if (!this.typesMatch(this.inferType(stmt.expr), this.inferType(arm.pattern))) {
                  this.report("Match arm pattern type must match subject type", arm.pattern);
                }
              }
              this.checkBlock(arm.body);
            }
            break;
          case "as_block": {
            const entityType = this.inferEntityTypeFromSelector(stmt.selector);
            this.pushSelfType(entityType);
            this.checkBlock(stmt.body);
            this.popSelfType();
            break;
          }
          case "at_block":
            this.checkBlock(stmt.body);
            break;
          case "as_at": {
            const entityType = this.inferEntityTypeFromSelector(stmt.as_sel);
            this.pushSelfType(entityType);
            this.checkBlock(stmt.body);
            this.popSelfType();
            break;
          }
          case "execute":
            for (const sub of stmt.subcommands) {
              if (sub.kind === "as" && sub.selector) {
                const entityType = this.inferEntityTypeFromSelector(sub.selector);
                this.pushSelfType(entityType);
              }
            }
            this.checkBlock(stmt.body);
            for (const sub of stmt.subcommands) {
              if (sub.kind === "as") {
                this.popSelfType();
              }
            }
            break;
          case "expr":
            this.checkExpr(stmt.expr);
            break;
          case "raw":
            break;
        }
      }
      checkLetStmt(stmt) {
        const expectedType = stmt.type ? this.normalizeType(stmt.type) : void 0;
        this.checkExpr(stmt.init, expectedType);
        const type = expectedType ?? this.inferType(stmt.init);
        this.scope.set(stmt.name, { type, mutable: true });
        const actualType = this.inferType(stmt.init, expectedType);
        if (expectedType && stmt.init.kind !== "struct_lit" && stmt.init.kind !== "array_lit" && !(actualType.kind === "named" && actualType.name === "void") && !this.typesMatch(expectedType, actualType)) {
          this.report(`Type mismatch: expected ${this.typeToString(expectedType)}, got ${this.typeToString(actualType)}`, stmt);
        }
      }
      checkReturnStmt(stmt) {
        if (!this.currentReturnType)
          return;
        const expectedType = this.currentReturnType;
        if (stmt.value) {
          const actualType = this.inferType(stmt.value, expectedType);
          this.checkExpr(stmt.value, expectedType);
          if (!this.typesMatch(expectedType, actualType)) {
            this.report(`Return type mismatch: expected ${this.typeToString(expectedType)}, got ${this.typeToString(actualType)}`, stmt);
          }
        } else {
          if (expectedType.kind !== "named" || expectedType.name !== "void") {
            this.report(`Missing return value: expected ${this.typeToString(expectedType)}`, stmt);
          }
        }
      }
      checkExpr(expr, expectedType) {
        switch (expr.kind) {
          case "ident":
            if (!this.scope.has(expr.name)) {
              this.report(`Variable '${expr.name}' used before declaration`, expr);
            }
            break;
          case "call":
            this.checkCallExpr(expr);
            break;
          case "invoke":
            this.checkInvokeExpr(expr);
            break;
          case "member":
            this.checkMemberExpr(expr);
            break;
          case "static_call":
            this.checkStaticCallExpr(expr);
            break;
          case "binary":
            this.checkExpr(expr.left);
            this.checkExpr(expr.right);
            break;
          case "is_check": {
            this.checkExpr(expr.expr);
            const checkedType = this.inferType(expr.expr);
            if (checkedType.kind !== "entity") {
              this.report(`'is' checks require an entity expression, got ${this.typeToString(checkedType)}`, expr.expr);
            }
            break;
          }
          case "unary":
            this.checkExpr(expr.operand);
            break;
          case "assign":
            if (!this.scope.has(expr.target)) {
              this.report(`Variable '${expr.target}' used before declaration`, expr);
            } else if (!this.scope.get(expr.target)?.mutable) {
              this.report(`Cannot assign to const '${expr.target}'`, expr);
            }
            this.checkExpr(expr.value, this.scope.get(expr.target)?.type);
            break;
          case "member_assign":
            this.checkExpr(expr.obj);
            this.checkExpr(expr.value);
            break;
          case "index":
            this.checkExpr(expr.obj);
            this.checkExpr(expr.index);
            const indexType = this.inferType(expr.index);
            if (indexType.kind !== "named" || indexType.name !== "int") {
              this.report("Array index must be int", expr.index);
            }
            break;
          case "struct_lit":
            for (const field of expr.fields) {
              this.checkExpr(field.value);
            }
            break;
          case "str_interp":
            for (const part of expr.parts) {
              if (typeof part !== "string") {
                this.checkExpr(part);
              }
            }
            break;
          case "f_string":
            for (const part of expr.parts) {
              if (part.kind !== "expr") {
                continue;
              }
              this.checkExpr(part.expr);
              const partType = this.inferType(part.expr);
              if (!(partType.kind === "named" && (partType.name === "int" || partType.name === "string" || partType.name === "format_string"))) {
                this.report(`f-string placeholder must be int or string, got ${this.typeToString(partType)}`, part.expr);
              }
            }
            break;
          case "array_lit":
            for (const elem of expr.elements) {
              this.checkExpr(elem);
            }
            break;
          case "lambda":
            this.checkLambdaExpr(expr, expectedType);
            break;
          case "blockpos":
            break;
          // Literals don't need checking
          case "int_lit":
          case "float_lit":
          case "bool_lit":
          case "str_lit":
          case "mc_name":
          case "range_lit":
          case "selector":
          case "byte_lit":
          case "short_lit":
          case "long_lit":
          case "double_lit":
            break;
        }
      }
      checkCallExpr(expr) {
        if (expr.fn === "tp" || expr.fn === "tp_to") {
          this.checkTpCall(expr);
        }
        const richTextBuiltin = this.richTextBuiltins.get(expr.fn);
        if (richTextBuiltin) {
          this.checkRichTextBuiltinCall(expr, richTextBuiltin.messageIndex);
          return;
        }
        const builtin = BUILTIN_SIGNATURES[expr.fn];
        if (builtin) {
          this.checkFunctionCallArgs(expr.args, builtin.params, expr.fn, expr);
          return;
        }
        const fn = this.functions.get(expr.fn);
        if (fn) {
          const requiredParams = fn.params.filter((param) => !param.default).length;
          if (expr.args.length < requiredParams || expr.args.length > fn.params.length) {
            const expectedRange = requiredParams === fn.params.length ? `${fn.params.length}` : `${requiredParams}-${fn.params.length}`;
            this.report(`Function '${expr.fn}' expects ${expectedRange} arguments, got ${expr.args.length}`, expr);
          }
          for (let i = 0; i < expr.args.length; i++) {
            const paramType = fn.params[i] ? this.normalizeType(fn.params[i].type) : void 0;
            if (paramType) {
              this.checkExpr(expr.args[i], paramType);
            }
            const argType = this.inferType(expr.args[i], paramType);
            if (paramType && !this.typesMatch(paramType, argType)) {
              this.report(`Argument ${i + 1} of '${expr.fn}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`, expr.args[i]);
            }
          }
          return;
        }
        const varType = this.scope.get(expr.fn)?.type;
        if (varType?.kind === "function_type") {
          this.checkFunctionCallArgs(expr.args, varType.params, expr.fn, expr);
          return;
        }
        const implMethod = this.resolveInstanceMethod(expr);
        if (implMethod) {
          this.checkFunctionCallArgs(expr.args, implMethod.params.map((param) => this.normalizeType(param.type)), implMethod.name, expr);
          return;
        }
        for (const arg of expr.args) {
          this.checkExpr(arg);
        }
      }
      checkRichTextBuiltinCall(expr, messageIndex) {
        for (let i = 0; i < expr.args.length; i++) {
          this.checkExpr(expr.args[i], i === messageIndex ? void 0 : STRING_TYPE);
        }
        const message = expr.args[messageIndex];
        if (!message) {
          return;
        }
        const messageType = this.inferType(message);
        if (messageType.kind !== "named" || messageType.name !== "string" && messageType.name !== "format_string") {
          this.report(`Argument ${messageIndex + 1} of '${expr.fn}' expects string or format_string, got ${this.typeToString(messageType)}`, message);
        }
      }
      checkInvokeExpr(expr) {
        this.checkExpr(expr.callee);
        const calleeType = this.inferType(expr.callee);
        if (calleeType.kind !== "function_type") {
          this.report("Attempted to call a non-function value", expr.callee);
          for (const arg of expr.args) {
            this.checkExpr(arg);
          }
          return;
        }
        this.checkFunctionCallArgs(expr.args, calleeType.params, "lambda", expr);
      }
      checkFunctionCallArgs(args, params, calleeName, node) {
        if (args.length !== params.length) {
          this.report(`Function '${calleeName}' expects ${params.length} arguments, got ${args.length}`, node);
        }
        for (let i = 0; i < args.length; i++) {
          const paramType = params[i];
          if (!paramType) {
            this.checkExpr(args[i]);
            continue;
          }
          this.checkExpr(args[i], paramType);
          const argType = this.inferType(args[i], paramType);
          if (!this.typesMatch(paramType, argType)) {
            this.report(`Argument ${i + 1} of '${calleeName}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`, args[i]);
          }
        }
      }
      checkTpCall(expr) {
        const dest = expr.args[1];
        if (!dest) {
          return;
        }
        const destType = this.inferType(dest);
        if (destType.kind === "named" && destType.name === "BlockPos") {
          return;
        }
        if (dest.kind === "selector" && !dest.isSingle) {
          this.report("tp destination must be a single-entity selector (@s, @p, @r, or limit=1)", dest);
        }
      }
      checkMemberExpr(expr) {
        if (!(expr.obj.kind === "ident" && this.enums.has(expr.obj.name))) {
          this.checkExpr(expr.obj);
        }
        if (expr.obj.kind === "ident") {
          if (this.enums.has(expr.obj.name)) {
            const enumVariants = this.enums.get(expr.obj.name);
            if (!enumVariants.has(expr.field)) {
              this.report(`Enum '${expr.obj.name}' has no variant '${expr.field}'`, expr);
            }
            return;
          }
          const varSymbol = this.scope.get(expr.obj.name);
          const varType = varSymbol?.type;
          if (varType) {
            if (varType.kind === "struct") {
              const structFields = this.structs.get(varType.name);
              if (structFields && !structFields.has(expr.field)) {
                this.report(`Struct '${varType.name}' has no field '${expr.field}'`, expr);
              }
            } else if (varType.kind === "array") {
              if (expr.field !== "len" && expr.field !== "push" && expr.field !== "pop") {
                this.report(`Array has no field '${expr.field}'`, expr);
              }
            } else if (varType.kind === "named") {
              if (varType.name !== "void") {
                if (["int", "bool", "float", "string", "byte", "short", "long", "double"].includes(varType.name)) {
                  this.report(`Cannot access member '${expr.field}' on ${this.typeToString(varType)}`, expr);
                }
              }
            }
          }
        }
      }
      checkStaticCallExpr(expr) {
        const method = this.implMethods.get(expr.type)?.get(expr.method);
        if (!method) {
          this.report(`Type '${expr.type}' has no static method '${expr.method}'`, expr);
          for (const arg of expr.args) {
            this.checkExpr(arg);
          }
          return;
        }
        if (method.params[0]?.name === "self") {
          this.report(`Method '${expr.type}::${expr.method}' is an instance method`, expr);
          return;
        }
        this.checkFunctionCallArgs(expr.args, method.params.map((param) => this.normalizeType(param.type)), `${expr.type}::${expr.method}`, expr);
      }
      checkLambdaExpr(expr, expectedType) {
        const normalizedExpected = expectedType ? this.normalizeType(expectedType) : void 0;
        const expectedFnType = normalizedExpected?.kind === "function_type" ? normalizedExpected : void 0;
        const lambdaType = this.inferLambdaType(expr, expectedFnType);
        if (expectedFnType && !this.typesMatch(expectedFnType, lambdaType)) {
          this.report(`Type mismatch: expected ${this.typeToString(expectedFnType)}, got ${this.typeToString(lambdaType)}`, expr);
          return;
        }
        const outerScope = this.scope;
        const outerReturnType = this.currentReturnType;
        const lambdaScope = new Map(this.scope);
        const paramTypes = expectedFnType?.params ?? lambdaType.params;
        for (let i = 0; i < expr.params.length; i++) {
          lambdaScope.set(expr.params[i].name, {
            type: paramTypes[i] ?? { kind: "named", name: "void" },
            mutable: true
          });
        }
        this.scope = lambdaScope;
        this.currentReturnType = expr.returnType ? this.normalizeType(expr.returnType) : expectedFnType?.return ?? lambdaType.return;
        if (Array.isArray(expr.body)) {
          this.checkBlock(expr.body);
        } else {
          this.checkExpr(expr.body, this.currentReturnType);
          const actualType = this.inferType(expr.body, this.currentReturnType);
          if (!this.typesMatch(this.currentReturnType, actualType)) {
            this.report(`Return type mismatch: expected ${this.typeToString(this.currentReturnType)}, got ${this.typeToString(actualType)}`, expr.body);
          }
        }
        this.scope = outerScope;
        this.currentReturnType = outerReturnType;
      }
      checkIfBranches(stmt) {
        const narrowed = this.getThenBranchNarrowing(stmt.cond);
        if (narrowed) {
          const thenScope = new Map(this.scope);
          thenScope.set(narrowed.name, { type: narrowed.type, mutable: narrowed.mutable });
          const outerScope = this.scope;
          this.scope = thenScope;
          this.checkBlock(stmt.then);
          this.scope = outerScope;
        } else {
          this.checkBlock(stmt.then);
        }
        if (stmt.else_) {
          this.checkBlock(stmt.else_);
        }
      }
      getThenBranchNarrowing(cond) {
        if (cond.kind !== "is_check" || cond.expr.kind !== "ident") {
          return null;
        }
        const symbol = this.scope.get(cond.expr.name);
        if (!symbol || symbol.type.kind !== "entity") {
          return null;
        }
        return {
          name: cond.expr.name,
          type: { kind: "entity", entityType: cond.entityType },
          mutable: symbol.mutable
        };
      }
      inferType(expr, expectedType) {
        switch (expr.kind) {
          case "int_lit":
            return { kind: "named", name: "int" };
          case "float_lit":
            return { kind: "named", name: "float" };
          case "byte_lit":
            return { kind: "named", name: "byte" };
          case "short_lit":
            return { kind: "named", name: "short" };
          case "long_lit":
            return { kind: "named", name: "long" };
          case "double_lit":
            return { kind: "named", name: "double" };
          case "bool_lit":
            return { kind: "named", name: "bool" };
          case "str_lit":
          case "mc_name":
            return { kind: "named", name: "string" };
          case "str_interp":
            for (const part of expr.parts) {
              if (typeof part !== "string") {
                this.checkExpr(part);
              }
            }
            return { kind: "named", name: "string" };
          case "f_string":
            for (const part of expr.parts) {
              if (part.kind === "expr") {
                this.checkExpr(part.expr);
              }
            }
            return FORMAT_STRING_TYPE;
          case "blockpos":
            return { kind: "named", name: "BlockPos" };
          case "ident":
            return this.scope.get(expr.name)?.type ?? { kind: "named", name: "void" };
          case "call": {
            const builtin = BUILTIN_SIGNATURES[expr.fn];
            if (builtin) {
              return builtin.return;
            }
            if (expr.fn === "__array_push") {
              return VOID_TYPE;
            }
            if (expr.fn === "__array_pop") {
              const target = expr.args[0];
              if (target && target.kind === "ident") {
                const targetType = this.scope.get(target.name)?.type;
                if (targetType?.kind === "array")
                  return targetType.elem;
              }
              return INT_TYPE;
            }
            if (expr.fn === "bossbar_get_value") {
              return INT_TYPE;
            }
            if (expr.fn === "random_sequence") {
              return VOID_TYPE;
            }
            const varType = this.scope.get(expr.fn)?.type;
            if (varType?.kind === "function_type") {
              return varType.return;
            }
            const implMethod = this.resolveInstanceMethod(expr);
            if (implMethod) {
              return this.normalizeType(implMethod.returnType);
            }
            const fn = this.functions.get(expr.fn);
            return fn?.returnType ?? INT_TYPE;
          }
          case "static_call": {
            const method = this.implMethods.get(expr.type)?.get(expr.method);
            return method ? this.normalizeType(method.returnType) : { kind: "named", name: "void" };
          }
          case "invoke": {
            const calleeType = this.inferType(expr.callee);
            if (calleeType.kind === "function_type") {
              return calleeType.return;
            }
            return { kind: "named", name: "void" };
          }
          case "member":
            if (expr.obj.kind === "ident" && this.enums.has(expr.obj.name)) {
              return { kind: "enum", name: expr.obj.name };
            }
            if (expr.obj.kind === "ident") {
              const objTypeNode = this.scope.get(expr.obj.name)?.type;
              if (objTypeNode?.kind === "array" && expr.field === "len") {
                return { kind: "named", name: "int" };
              }
            }
            return { kind: "named", name: "void" };
          case "index": {
            const objType = this.inferType(expr.obj);
            if (objType.kind === "array")
              return objType.elem;
            return { kind: "named", name: "void" };
          }
          case "binary":
            if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(expr.op)) {
              return { kind: "named", name: "bool" };
            }
            return this.inferType(expr.left);
          case "is_check":
            return { kind: "named", name: "bool" };
          case "unary":
            if (expr.op === "!")
              return { kind: "named", name: "bool" };
            return this.inferType(expr.operand);
          case "array_lit":
            if (expr.elements.length > 0) {
              return { kind: "array", elem: this.inferType(expr.elements[0]) };
            }
            return { kind: "array", elem: { kind: "named", name: "int" } };
          case "struct_lit":
            if (expectedType) {
              const normalized = this.normalizeType(expectedType);
              if (normalized.kind === "struct") {
                return normalized;
              }
            }
            return { kind: "named", name: "void" };
          case "lambda":
            return this.inferLambdaType(expr, expectedType && this.normalizeType(expectedType).kind === "function_type" ? this.normalizeType(expectedType) : void 0);
          default:
            return { kind: "named", name: "void" };
        }
      }
      inferLambdaType(expr, expectedType) {
        const params = expr.params.map((param, index) => {
          if (param.type) {
            return this.normalizeType(param.type);
          }
          const inferred = expectedType?.params[index];
          if (inferred) {
            return inferred;
          }
          this.report(`Lambda parameter '${param.name}' requires a type annotation`, expr);
          return { kind: "named", name: "void" };
        });
        let returnType = expr.returnType ? this.normalizeType(expr.returnType) : expectedType?.return;
        if (!returnType) {
          returnType = Array.isArray(expr.body) ? { kind: "named", name: "void" } : this.inferType(expr.body);
        }
        return { kind: "function_type", params, return: returnType };
      }
      // ---------------------------------------------------------------------------
      // Entity Type Helpers
      // ---------------------------------------------------------------------------
      /** Infer entity type from a selector */
      inferEntityTypeFromSelector(selector) {
        if (selector.kind === "@a" || selector.kind === "@p" || selector.kind === "@r") {
          return "Player";
        }
        if (selector.filters?.type) {
          const mcType = selector.filters.type.toLowerCase();
          return MC_TYPE_TO_ENTITY[mcType] ?? "entity";
        }
        if (selector.kind === "@s") {
          return this.selfTypeStack[this.selfTypeStack.length - 1];
        }
        return "entity";
      }
      resolveInstanceMethod(expr) {
        const receiver = expr.args[0];
        if (!receiver) {
          return null;
        }
        const receiverType = this.inferType(receiver);
        if (receiverType.kind !== "struct") {
          return null;
        }
        const method = this.implMethods.get(receiverType.name)?.get(expr.fn);
        if (!method || method.params[0]?.name !== "self") {
          return null;
        }
        return method;
      }
      /** Check if childType is a subtype of parentType */
      isEntitySubtype(childType, parentType) {
        if (childType === parentType)
          return true;
        let current = childType;
        while (current !== null) {
          if (current === parentType)
            return true;
          current = ENTITY_HIERARCHY[current];
        }
        return false;
      }
      /** Push a new self type context */
      pushSelfType(entityType) {
        this.selfTypeStack.push(entityType);
      }
      /** Pop self type context */
      popSelfType() {
        if (this.selfTypeStack.length > 1) {
          this.selfTypeStack.pop();
        }
      }
      /** Get current @s type */
      getCurrentSelfType() {
        return this.selfTypeStack[this.selfTypeStack.length - 1];
      }
      typesMatch(expected, actual) {
        if (expected.kind !== actual.kind)
          return false;
        if (expected.kind === "named" && actual.kind === "named") {
          if (actual.name === "void")
            return true;
          return expected.name === actual.name;
        }
        if (expected.kind === "array" && actual.kind === "array") {
          return this.typesMatch(expected.elem, actual.elem);
        }
        if (expected.kind === "struct" && actual.kind === "struct") {
          return expected.name === actual.name;
        }
        if (expected.kind === "enum" && actual.kind === "enum") {
          return expected.name === actual.name;
        }
        if (expected.kind === "function_type" && actual.kind === "function_type") {
          return expected.params.length === actual.params.length && expected.params.every((param, index) => this.typesMatch(param, actual.params[index])) && this.typesMatch(expected.return, actual.return);
        }
        if (expected.kind === "entity" && actual.kind === "entity") {
          return this.isEntitySubtype(actual.entityType, expected.entityType);
        }
        if (expected.kind === "selector" && actual.kind === "entity") {
          return true;
        }
        return false;
      }
      typeToString(type) {
        switch (type.kind) {
          case "named":
            return type.name;
          case "array":
            return `${this.typeToString(type.elem)}[]`;
          case "struct":
            return type.name;
          case "enum":
            return type.name;
          case "function_type":
            return `(${type.params.map((param) => this.typeToString(param)).join(", ")}) -> ${this.typeToString(type.return)}`;
          case "entity":
            return type.entityType;
          case "selector":
            return "selector";
          default:
            return "unknown";
        }
      }
      normalizeType(type) {
        if (type.kind === "array") {
          return { kind: "array", elem: this.normalizeType(type.elem) };
        }
        if (type.kind === "function_type") {
          return {
            kind: "function_type",
            params: type.params.map((param) => this.normalizeType(param)),
            return: this.normalizeType(type.return)
          };
        }
        if ((type.kind === "struct" || type.kind === "enum") && this.enums.has(type.name)) {
          return { kind: "enum", name: type.name };
        }
        if (type.kind === "struct" && type.name in ENTITY_HIERARCHY) {
          return { kind: "entity", entityType: type.name };
        }
        if (type.kind === "named" && type.name in ENTITY_HIERARCHY) {
          return { kind: "entity", entityType: type.name };
        }
        return type;
      }
    };
    exports2.TypeChecker = TypeChecker;
  }
});

// ../../dist/ir/builder.js
var require_builder = __commonJS({
  "../../dist/ir/builder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.IRBuilder = void 0;
    exports2.buildModule = buildModule;
    var IRBuilder = class {
      constructor() {
        this.tempCount = 0;
        this.labelCount = 0;
        this.currentBlock = null;
        this.blocks = [];
        this.locals = /* @__PURE__ */ new Set();
      }
      // -------------------------------------------------------------------------
      // Names
      // -------------------------------------------------------------------------
      freshTemp() {
        const name = `$t${this.tempCount++}`;
        this.locals.add(name);
        return name;
      }
      freshLabel(hint = "L") {
        return `${hint}_${this.labelCount++}`;
      }
      // -------------------------------------------------------------------------
      // Block management
      // -------------------------------------------------------------------------
      startBlock(label) {
        this.currentBlock = { label, instrs: [], term: { op: "return" } };
      }
      get block() {
        if (!this.currentBlock)
          throw new Error("No active block");
        return this.currentBlock;
      }
      sealBlock(term) {
        this.block.term = term;
        this.blocks.push(this.block);
        this.currentBlock = null;
      }
      // -------------------------------------------------------------------------
      // Emit instructions
      // -------------------------------------------------------------------------
      emitAssign(dst, src) {
        this.locals.add(dst);
        this.block.instrs.push({ op: "assign", dst, src });
      }
      emitBinop(dst, lhs, bop, rhs) {
        this.locals.add(dst);
        this.block.instrs.push({ op: "binop", dst, lhs, bop, rhs });
      }
      emitCmp(dst, lhs, cop, rhs) {
        this.locals.add(dst);
        this.block.instrs.push({ op: "cmp", dst, lhs, cop, rhs });
      }
      emitCall(fn, args, dst) {
        if (dst)
          this.locals.add(dst);
        this.block.instrs.push({ op: "call", fn, args, dst });
      }
      emitRaw(cmd) {
        this.block.instrs.push({ op: "raw", cmd });
      }
      // -------------------------------------------------------------------------
      // Terminators
      // -------------------------------------------------------------------------
      emitJump(target) {
        this.sealBlock({ op: "jump", target });
      }
      emitJumpIf(cond, then, else_) {
        this.sealBlock({ op: "jump_if", cond, then, else_ });
      }
      emitReturn(value) {
        this.sealBlock({ op: "return", value });
      }
      emitTickYield(continuation) {
        this.sealBlock({ op: "tick_yield", continuation });
      }
      // -------------------------------------------------------------------------
      // Build
      // -------------------------------------------------------------------------
      build(name, params, isTickLoop = false) {
        return {
          name,
          params,
          locals: Array.from(this.locals),
          blocks: this.blocks,
          isTickLoop
        };
      }
    };
    exports2.IRBuilder = IRBuilder;
    function buildModule(namespace, fns, globals = []) {
      return { namespace, functions: fns, globals };
    }
  }
});

// ../../dist/lowering/index.js
var require_lowering = __commonJS({
  "../../dist/lowering/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Lowering = void 0;
    var builder_1 = require_builder();
    var diagnostics_1 = require_diagnostics();
    var path2 = __importStar(require("path"));
    var types_1 = require_types();
    var BUILTINS2 = {
      say: ([msg]) => `say ${msg}`,
      tell: ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
      tellraw: ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
      title: ([sel, msg]) => `title ${sel} title {"text":"${msg}"}`,
      actionbar: ([sel, msg]) => `title ${sel} actionbar {"text":"${msg}"}`,
      subtitle: ([sel, msg]) => `title ${sel} subtitle {"text":"${msg}"}`,
      title_times: ([sel, fadeIn, stay, fadeOut]) => `title ${sel} times ${fadeIn} ${stay} ${fadeOut}`,
      announce: ([msg]) => `tellraw @a {"text":"${msg}"}`,
      give: ([sel, item, count, nbt]) => nbt ? `give ${sel} ${item}${nbt} ${count ?? "1"}` : `give ${sel} ${item} ${count ?? "1"}`,
      kill: ([sel]) => `kill ${sel ?? "@s"}`,
      effect: ([sel, eff, dur, amp]) => `effect give ${sel} ${eff} ${dur ?? "30"} ${amp ?? "0"}`,
      effect_clear: ([sel, eff]) => eff ? `effect clear ${sel} ${eff}` : `effect clear ${sel}`,
      summon: ([type, x, y, z, nbt]) => {
        const pos = [x ?? "~", y ?? "~", z ?? "~"].join(" ");
        return nbt ? `summon ${type} ${pos} ${nbt}` : `summon ${type} ${pos}`;
      },
      particle: ([name, x, y, z]) => {
        const pos = [x ?? "~", y ?? "~", z ?? "~"].join(" ");
        return `particle ${name} ${pos}`;
      },
      playsound: ([sound, source, sel, x, y, z, volume, pitch, minVolume]) => ["playsound", sound, source, sel, x, y, z, volume, pitch, minVolume].filter(Boolean).join(" "),
      tp: () => null,
      // Special handling
      tp_to: () => null,
      // Special handling (deprecated alias)
      clear: ([sel, item]) => `clear ${sel} ${item ?? ""}`.trim(),
      weather: ([type]) => `weather ${type}`,
      time_set: ([val]) => `time set ${val}`,
      time_add: ([val]) => `time add ${val}`,
      gamerule: ([rule, val]) => `gamerule ${rule} ${val}`,
      tag_add: ([sel, tag]) => `tag ${sel} add ${tag}`,
      tag_remove: ([sel, tag]) => `tag ${sel} remove ${tag}`,
      kick: ([player, reason]) => `kick ${player} ${reason ?? ""}`.trim(),
      setblock: ([x, y, z, block]) => `setblock ${x} ${y} ${z} ${block}`,
      fill: ([x1, y1, z1, x2, y2, z2, block]) => `fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`,
      clone: ([x1, y1, z1, x2, y2, z2, dx, dy, dz]) => `clone ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${dx} ${dy} ${dz}`,
      difficulty: ([level]) => `difficulty ${level}`,
      xp_add: ([sel, amount, type]) => `xp add ${sel} ${amount} ${type ?? "points"}`,
      xp_set: ([sel, amount, type]) => `xp set ${sel} ${amount} ${type ?? "points"}`,
      random: () => null,
      // Special handling
      random_native: () => null,
      // Special handling
      random_sequence: () => null,
      // Special handling
      scoreboard_get: () => null,
      // Special handling (returns value)
      scoreboard_set: () => null,
      // Special handling
      score: () => null,
      // Special handling (same as scoreboard_get)
      scoreboard_display: () => null,
      // Special handling
      scoreboard_hide: () => null,
      // Special handling
      scoreboard_add_objective: () => null,
      // Special handling
      scoreboard_remove_objective: () => null,
      // Special handling
      bossbar_add: () => null,
      // Special handling
      bossbar_set_value: () => null,
      // Special handling
      bossbar_set_max: () => null,
      // Special handling
      bossbar_set_color: () => null,
      // Special handling
      bossbar_set_style: () => null,
      // Special handling
      bossbar_set_visible: () => null,
      // Special handling
      bossbar_set_players: () => null,
      // Special handling
      bossbar_remove: () => null,
      // Special handling
      bossbar_get_value: () => null,
      // Special handling
      team_add: () => null,
      // Special handling
      team_remove: () => null,
      // Special handling
      team_join: () => null,
      // Special handling
      team_leave: () => null,
      // Special handling
      team_option: () => null,
      // Special handling
      data_get: () => null,
      // Special handling (returns value from NBT)
      data_merge: () => null,
      // Special handling (merge NBT)
      set_new: () => null,
      // Special handling (returns set ID)
      set_add: () => null,
      // Special handling
      set_contains: () => null,
      // Special handling (returns 1/0)
      set_remove: () => null,
      // Special handling
      set_clear: () => null,
      // Special handling
      setTimeout: () => null,
      // Special handling
      setInterval: () => null,
      // Special handling
      clearInterval: () => null
      // Special handling
    };
    function getSpan(node) {
      return node?.span;
    }
    var NAMESPACED_ENTITY_TYPE_RE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
    var BARE_ENTITY_TYPE_RE = /^[a-z0-9_./-]+$/;
    var ENTITY_TO_MC_TYPE = {
      Player: "minecraft:player",
      Zombie: "minecraft:zombie",
      Skeleton: "minecraft:skeleton",
      Creeper: "minecraft:creeper",
      Spider: "minecraft:spider",
      Enderman: "minecraft:enderman",
      Pig: "minecraft:pig",
      Cow: "minecraft:cow",
      Sheep: "minecraft:sheep",
      Chicken: "minecraft:chicken",
      Villager: "minecraft:villager",
      ArmorStand: "minecraft:armor_stand",
      Item: "minecraft:item",
      Arrow: "minecraft:arrow"
    };
    function normalizeSelector(selector, warnings) {
      return selector.replace(/type=([^,\]]+)/g, (match, entityType) => {
        const trimmed = entityType.trim();
        if (trimmed.includes(":")) {
          if (!NAMESPACED_ENTITY_TYPE_RE.test(trimmed)) {
            throw new diagnostics_1.DiagnosticError("LoweringError", `Invalid entity type format: "${trimmed}" (must be namespace:name)`, { line: 1, col: 1 });
          }
          return match;
        }
        if (!BARE_ENTITY_TYPE_RE.test(trimmed)) {
          throw new diagnostics_1.DiagnosticError("LoweringError", `Invalid entity type format: "${trimmed}" (must be namespace:name or bare_name)`, { line: 1, col: 1 });
        }
        warnings.push({
          message: `Unnamespaced entity type "${trimmed}", auto-qualifying to "minecraft:${trimmed}"`,
          code: "W_UNNAMESPACED_TYPE"
        });
        return `type=minecraft:${trimmed}`;
      });
    }
    function emitCoord(component) {
      switch (component.kind) {
        case "absolute":
          return String(component.value);
        case "relative":
          return component.offset === 0 ? "~" : `~${component.offset}`;
        case "local":
          return component.offset === 0 ? "^" : `^${component.offset}`;
      }
    }
    function emitBlockPos(pos) {
      return `${emitCoord(pos.x)} ${emitCoord(pos.y)} ${emitCoord(pos.z)}`;
    }
    var Lowering = class {
      constructor(namespace, sourceRanges = []) {
        this.functions = [];
        this.globals = [];
        this.globalNames = /* @__PURE__ */ new Map();
        this.fnDecls = /* @__PURE__ */ new Map();
        this.implMethods = /* @__PURE__ */ new Map();
        this.specializedFunctions = /* @__PURE__ */ new Map();
        this.currentFn = "";
        this.foreachCounter = 0;
        this.lambdaCounter = 0;
        this.timeoutCounter = 0;
        this.intervalCounter = 0;
        this.warnings = [];
        this.varMap = /* @__PURE__ */ new Map();
        this.lambdaBindings = /* @__PURE__ */ new Map();
        this.intervalBindings = /* @__PURE__ */ new Map();
        this.intervalFunctions = /* @__PURE__ */ new Map();
        this.currentCallbackBindings = /* @__PURE__ */ new Map();
        this.currentContext = {};
        this.blockPosVars = /* @__PURE__ */ new Map();
        this.structDefs = /* @__PURE__ */ new Map();
        this.structDecls = /* @__PURE__ */ new Map();
        this.enumDefs = /* @__PURE__ */ new Map();
        this.functionDefaults = /* @__PURE__ */ new Map();
        this.constValues = /* @__PURE__ */ new Map();
        this.stringValues = /* @__PURE__ */ new Map();
        this.varTypes = /* @__PURE__ */ new Map();
        this.floatVars = /* @__PURE__ */ new Set();
        this.worldObjCounter = 0;
        this.loopStack = [];
        this.currentFnParamNames = /* @__PURE__ */ new Set();
        this.currentFnMacroParams = /* @__PURE__ */ new Set();
        this.macroFunctionInfo = /* @__PURE__ */ new Map();
        this.namespace = namespace;
        this.sourceRanges = sourceRanges;
        LoweringBuilder.resetTempCounter();
      }
      // ---------------------------------------------------------------------------
      // MC Macro pre-scan: identify which function params need macro treatment
      // ---------------------------------------------------------------------------
      preScanMacroFunctions(program) {
        for (const fn of program.declarations) {
          const paramNames = new Set(fn.params.map((p) => p.name));
          const macroParams = /* @__PURE__ */ new Set();
          this.preScanStmts(fn.body, paramNames, macroParams);
          if (macroParams.size > 0) {
            this.macroFunctionInfo.set(fn.name, [...macroParams]);
          }
        }
        for (const implBlock of program.implBlocks ?? []) {
          for (const method of implBlock.methods) {
            const paramNames = new Set(method.params.map((p) => p.name));
            const macroParams = /* @__PURE__ */ new Set();
            this.preScanStmts(method.body, paramNames, macroParams);
            if (macroParams.size > 0) {
              this.macroFunctionInfo.set(`${implBlock.typeName}_${method.name}`, [...macroParams]);
            }
          }
        }
      }
      preScanStmts(stmts, paramNames, macroParams) {
        for (const stmt of stmts) {
          this.preScanStmt(stmt, paramNames, macroParams);
        }
      }
      preScanStmt(stmt, paramNames, macroParams) {
        switch (stmt.kind) {
          case "expr":
            this.preScanExpr(stmt.expr, paramNames, macroParams);
            break;
          case "let":
            this.preScanExpr(stmt.init, paramNames, macroParams);
            break;
          case "return":
            if (stmt.value)
              this.preScanExpr(stmt.value, paramNames, macroParams);
            break;
          case "if":
            this.preScanExpr(stmt.cond, paramNames, macroParams);
            this.preScanStmts(stmt.then, paramNames, macroParams);
            if (stmt.else_)
              this.preScanStmts(stmt.else_, paramNames, macroParams);
            break;
          case "while":
            this.preScanExpr(stmt.cond, paramNames, macroParams);
            this.preScanStmts(stmt.body, paramNames, macroParams);
            break;
          case "for":
            if (stmt.init)
              this.preScanStmt(stmt.init, paramNames, macroParams);
            this.preScanExpr(stmt.cond, paramNames, macroParams);
            this.preScanStmts(stmt.body, paramNames, macroParams);
            break;
          case "for_range":
            this.preScanStmts(stmt.body, paramNames, macroParams);
            break;
          case "foreach":
            this.preScanStmts(stmt.body, paramNames, macroParams);
            break;
          case "match":
            this.preScanExpr(stmt.expr, paramNames, macroParams);
            for (const arm of stmt.arms) {
              this.preScanStmts(arm.body, paramNames, macroParams);
            }
            break;
          case "as_block":
          case "at_block":
            this.preScanStmts(stmt.body, paramNames, macroParams);
            break;
          case "execute":
            this.preScanStmts(stmt.body, paramNames, macroParams);
            break;
        }
      }
      preScanExpr(expr, paramNames, macroParams) {
        if (expr.kind === "call" && BUILTINS2[expr.fn] !== void 0) {
          for (const arg of expr.args) {
            if (arg.kind === "ident" && paramNames.has(arg.name)) {
              macroParams.add(arg.name);
            }
          }
          return;
        }
        if (expr.kind === "call") {
          for (const arg of expr.args)
            this.preScanExpr(arg, paramNames, macroParams);
        } else if (expr.kind === "binary") {
          this.preScanExpr(expr.left, paramNames, macroParams);
          this.preScanExpr(expr.right, paramNames, macroParams);
        } else if (expr.kind === "unary") {
          this.preScanExpr(expr.operand, paramNames, macroParams);
        } else if (expr.kind === "assign") {
          this.preScanExpr(expr.value, paramNames, macroParams);
        }
      }
      // ---------------------------------------------------------------------------
      // Macro helpers
      // ---------------------------------------------------------------------------
      /**
       * If `expr` is a function parameter that needs macro treatment (runtime value
       * used in a literal position), returns the param name; otherwise null.
       */
      tryGetMacroParam(expr) {
        if (expr.kind !== "ident")
          return null;
        if (!this.currentFnParamNames.has(expr.name))
          return null;
        if (this.constValues.has(expr.name))
          return null;
        if (this.stringValues.has(expr.name))
          return null;
        return expr.name;
      }
      tryGetMacroParamByName(name) {
        if (!this.currentFnParamNames.has(name))
          return null;
        if (this.constValues.has(name))
          return null;
        if (this.stringValues.has(name))
          return null;
        return name;
      }
      /**
       * Converts an expression to a string for use as a builtin arg.
       * If the expression is a macro param, returns `$(name)` and sets macroParam.
       */
      exprToBuiltinArg(expr) {
        const macroParam = this.tryGetMacroParam(expr);
        if (macroParam) {
          return { str: `$(${macroParam})`, macroParam };
        }
        if (expr.kind === "rel_coord" || expr.kind === "local_coord") {
          const val = expr.value;
          const prefix = val[0];
          const rest = val.slice(1);
          if (rest && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rest)) {
            const paramName = this.tryGetMacroParamByName(rest);
            if (paramName) {
              return { str: `${prefix}$(${paramName})`, macroParam: paramName };
            }
          }
        }
        if (expr.kind === "struct_lit" || expr.kind === "array_lit") {
          return { str: this.exprToSnbt(expr) };
        }
        return { str: this.exprToString(expr) };
      }
      /**
       * Emits a call to a macro function, setting up both scoreboard params
       * (for arithmetic use) and NBT macro args (for coordinate/literal use).
       */
      emitMacroFunctionCall(fnName, args, macroParamNames, fnDecl) {
        const params = fnDecl?.params ?? [];
        const loweredArgs = args.map((arg) => this.lowerExpr(arg));
        for (let i = 0; i < loweredArgs.length; i++) {
          const operand = loweredArgs[i];
          if (operand.kind === "const") {
            this.builder.emitRaw(`scoreboard players set $p${i} rs ${operand.value}`);
          } else if (operand.kind === "var") {
            this.builder.emitRaw(`scoreboard players operation $p${i} rs = ${operand.name} rs`);
          }
        }
        for (const macroParam of macroParamNames) {
          const paramIdx = params.findIndex((p) => p.name === macroParam);
          if (paramIdx < 0 || paramIdx >= loweredArgs.length)
            continue;
          const operand = loweredArgs[paramIdx];
          if (operand.kind === "const") {
            this.builder.emitRaw(`data modify storage rs:macro_args ${macroParam} set value ${operand.value}`);
          } else if (operand.kind === "var") {
            this.builder.emitRaw(`execute store result storage rs:macro_args ${macroParam} int 1 run scoreboard players get ${operand.name} rs`);
          }
        }
        this.builder.emitRaw(`function ${this.namespace}:${fnName} with storage rs:macro_args`);
        const dst = this.builder.freshTemp();
        this.builder.emitRaw(`scoreboard players operation ${dst} rs = $ret rs`);
        return { kind: "var", name: dst };
      }
      lower(program) {
        this.namespace = program.namespace;
        this.preScanMacroFunctions(program);
        for (const struct of program.structs ?? []) {
          const fields = /* @__PURE__ */ new Map();
          for (const field of struct.fields) {
            fields.set(field.name, field.type);
          }
          this.structDefs.set(struct.name, fields);
          this.structDecls.set(struct.name, struct);
        }
        for (const enumDecl of program.enums ?? []) {
          const variants = /* @__PURE__ */ new Map();
          for (const variant of enumDecl.variants) {
            variants.set(variant.name, variant.value ?? 0);
          }
          this.enumDefs.set(enumDecl.name, variants);
        }
        for (const constDecl of program.consts ?? []) {
          this.constValues.set(constDecl.name, constDecl.value);
          this.varTypes.set(constDecl.name, this.normalizeType(constDecl.type));
        }
        for (const g of program.globals ?? []) {
          this.globalNames.set(g.name, { mutable: g.mutable });
          this.varTypes.set(g.name, this.normalizeType(g.type));
          const initValue = g.init.kind === "int_lit" ? g.init.value : 0;
          this.globals.push({ name: `$${g.name}`, init: initValue });
        }
        for (const fn of program.declarations) {
          this.fnDecls.set(fn.name, fn);
          this.functionDefaults.set(fn.name, fn.params.map((param) => param.default));
        }
        for (const implBlock of program.implBlocks ?? []) {
          let methods = this.implMethods.get(implBlock.typeName);
          if (!methods) {
            methods = /* @__PURE__ */ new Map();
            this.implMethods.set(implBlock.typeName, methods);
          }
          for (const method of implBlock.methods) {
            const loweredName = `${implBlock.typeName}_${method.name}`;
            methods.set(method.name, { fn: method, loweredName });
            this.fnDecls.set(loweredName, method);
            this.functionDefaults.set(loweredName, method.params.map((param) => param.default));
          }
        }
        for (const fn of program.declarations) {
          this.lowerFn(fn);
        }
        for (const implBlock of program.implBlocks ?? []) {
          for (const method of implBlock.methods) {
            this.lowerFn(method, { name: `${implBlock.typeName}_${method.name}` });
          }
        }
        return (0, builder_1.buildModule)(this.namespace, this.functions, this.globals);
      }
      // -------------------------------------------------------------------------
      // Function Lowering
      // -------------------------------------------------------------------------
      lowerFn(fn, options = {}) {
        const loweredName = options.name ?? fn.name;
        const callbackBindings = options.callbackBindings ?? /* @__PURE__ */ new Map();
        const stdlibCallSite = options.stdlibCallSite;
        const staticEventDec = fn.decorators.find((d) => d.name === "on");
        const eventType = staticEventDec?.args?.eventType;
        const eventParamSpecs = eventType && (0, types_1.isEventTypeName)(eventType) ? (0, types_1.getEventParamSpecs)(eventType) : [];
        const runtimeParams = staticEventDec ? [] : fn.params.filter((param) => !callbackBindings.has(param.name));
        this.currentFn = loweredName;
        this.currentStdlibCallSite = stdlibCallSite;
        this.foreachCounter = 0;
        this.varMap = /* @__PURE__ */ new Map();
        this.lambdaBindings = /* @__PURE__ */ new Map();
        this.intervalBindings = /* @__PURE__ */ new Map();
        this.currentCallbackBindings = new Map(callbackBindings);
        this.currentContext = {};
        this.blockPosVars = /* @__PURE__ */ new Map();
        this.stringValues = /* @__PURE__ */ new Map();
        this.builder = new LoweringBuilder();
        this.currentFnParamNames = new Set(runtimeParams.map((p) => p.name));
        this.currentFnMacroParams = /* @__PURE__ */ new Set();
        if (staticEventDec) {
          for (let i = 0; i < fn.params.length; i++) {
            const param = fn.params[i];
            const expected = eventParamSpecs[i];
            const normalizedType = this.normalizeType(param.type);
            this.varTypes.set(param.name, normalizedType);
            if (expected?.type.kind === "entity") {
              this.varMap.set(param.name, "@s");
              continue;
            }
            if (expected?.type.kind === "named" && expected.type.name === "string") {
              this.stringValues.set(param.name, "");
              continue;
            }
            this.varMap.set(param.name, `$${param.name}`);
          }
        } else {
          for (const param of runtimeParams) {
            const paramName = param.name;
            this.varMap.set(paramName, `$${paramName}`);
            this.varTypes.set(paramName, this.normalizeType(param.type));
          }
        }
        for (const param of fn.params) {
          if (callbackBindings.has(param.name)) {
            this.varTypes.set(param.name, this.normalizeType(param.type));
          }
        }
        this.builder.startBlock("entry");
        for (let i = 0; i < runtimeParams.length; i++) {
          const paramName = runtimeParams[i].name;
          const varName = `$${paramName}`;
          this.builder.emitAssign(varName, { kind: "var", name: `$p${i}` });
        }
        if (staticEventDec) {
          for (let i = 0; i < fn.params.length; i++) {
            const param = fn.params[i];
            const expected = eventParamSpecs[i];
            if (expected?.type.kind === "named" && expected.type.name !== "string") {
              this.builder.emitAssign(`$${param.name}`, { kind: "const", value: 0 });
            }
          }
        }
        this.lowerBlock(fn.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const isTickLoop = fn.decorators.some((d) => d.name === "tick");
        const tickRate = this.getTickRate(fn.decorators);
        const triggerDec = fn.decorators.find((d) => d.name === "on_trigger");
        const isTriggerHandler = !!triggerDec;
        const triggerName = triggerDec?.args?.trigger;
        const irFn = this.builder.build(loweredName, runtimeParams.map((p) => `$${p.name}`), isTickLoop);
        if (isTriggerHandler && triggerName) {
          irFn.isTriggerHandler = true;
          irFn.triggerName = triggerName;
        }
        const eventDec = fn.decorators.find((d) => d.name === "on_advancement" || d.name === "on_craft" || d.name === "on_death" || d.name === "on_login" || d.name === "on_join_team");
        if (eventDec) {
          switch (eventDec.name) {
            case "on_advancement":
              irFn.eventTrigger = { kind: "advancement", value: eventDec.args?.advancement };
              break;
            case "on_craft":
              irFn.eventTrigger = { kind: "craft", value: eventDec.args?.item };
              break;
            case "on_death":
              irFn.eventTrigger = { kind: "death" };
              break;
            case "on_login":
              irFn.eventTrigger = { kind: "login" };
              break;
            case "on_join_team":
              irFn.eventTrigger = { kind: "join_team", value: eventDec.args?.team };
              break;
          }
        }
        if (eventType && (0, types_1.isEventTypeName)(eventType)) {
          irFn.eventHandler = {
            eventType,
            tag: types_1.EVENT_TYPES[eventType].tag
          };
        }
        if (fn.decorators.some((d) => d.name === "load")) {
          irFn.isLoadInit = true;
        }
        if (tickRate && tickRate > 1) {
          this.wrapWithTickRate(irFn, tickRate);
        }
        if (this.currentFnMacroParams.size > 0) {
          irFn.isMacroFunction = true;
          irFn.macroParamNames = [...this.currentFnMacroParams];
          this.macroFunctionInfo.set(loweredName, irFn.macroParamNames);
        }
        this.functions.push(irFn);
      }
      getTickRate(decorators) {
        const tickDec = decorators.find((d) => d.name === "tick");
        return tickDec?.args?.rate;
      }
      wrapWithTickRate(fn, rate) {
        const counterVar = `$__tick_${fn.name}`;
        this.globals.push({ name: counterVar, init: 0 });
        const entry = fn.blocks[0];
        const originalInstrs = [...entry.instrs];
        const originalTerm = entry.term;
        entry.instrs = [
          { op: "raw", cmd: `scoreboard players add ${counterVar} rs 1` }
        ];
        const bodyLabel = "tick_body";
        const skipLabel = "tick_skip";
        entry.term = {
          op: "jump_if",
          cond: `${counterVar}_check`,
          then: bodyLabel,
          else_: skipLabel
        };
        entry.instrs.push({
          op: "raw",
          cmd: `execute store success score ${counterVar}_check rs if score ${counterVar} rs matches ${rate}..`
        });
        fn.blocks.push({
          label: bodyLabel,
          instrs: [
            { op: "raw", cmd: `scoreboard players set ${counterVar} rs 0` },
            ...originalInstrs
          ],
          term: originalTerm
        });
        fn.blocks.push({
          label: skipLabel,
          instrs: [],
          term: { op: "return" }
        });
      }
      // -------------------------------------------------------------------------
      // Statement Lowering
      // -------------------------------------------------------------------------
      lowerBlock(stmts) {
        for (const stmt of stmts) {
          this.lowerStmt(stmt);
        }
      }
      lowerStmt(stmt) {
        switch (stmt.kind) {
          case "let":
            this.lowerLetStmt(stmt);
            break;
          case "expr":
            this.lowerExpr(stmt.expr);
            break;
          case "return":
            this.lowerReturnStmt(stmt);
            break;
          case "break":
            this.lowerBreakStmt();
            break;
          case "continue":
            this.lowerContinueStmt();
            break;
          case "if":
            this.lowerIfStmt(stmt);
            break;
          case "while":
            this.lowerWhileStmt(stmt);
            break;
          case "for":
            this.lowerForStmt(stmt);
            break;
          case "foreach":
            this.lowerForeachStmt(stmt);
            break;
          case "for_range":
            this.lowerForRangeStmt(stmt);
            break;
          case "match":
            this.lowerMatchStmt(stmt);
            break;
          case "as_block":
            this.lowerAsBlockStmt(stmt);
            break;
          case "at_block":
            this.lowerAtBlockStmt(stmt);
            break;
          case "as_at":
            this.lowerAsAtStmt(stmt);
            break;
          case "execute":
            this.lowerExecuteStmt(stmt);
            break;
          case "raw":
            this.checkRawCommandInterpolation(stmt.cmd, stmt.span);
            this.builder.emitRaw(stmt.cmd);
            break;
        }
      }
      lowerLetStmt(stmt) {
        if (this.currentContext.binding === stmt.name) {
          throw new diagnostics_1.DiagnosticError("LoweringError", `Cannot redeclare foreach binding '${stmt.name}'`, stmt.span ?? { line: 0, col: 0 });
        }
        const varName = `$${stmt.name}`;
        this.varMap.set(stmt.name, varName);
        const declaredType = stmt.type ? this.normalizeType(stmt.type) : this.inferExprType(stmt.init);
        if (declaredType) {
          this.varTypes.set(stmt.name, declaredType);
          if (declaredType.kind === "named" && declaredType.name === "float") {
            this.floatVars.add(stmt.name);
          }
        }
        if (stmt.init.kind === "lambda") {
          const lambdaName = this.lowerLambdaExpr(stmt.init);
          this.lambdaBindings.set(stmt.name, lambdaName);
          return;
        }
        if (stmt.init.kind === "call" && stmt.init.fn === "setInterval") {
          const value2 = this.lowerExpr(stmt.init);
          const intervalFn = this.intervalFunctions.get(value2.kind === "const" ? value2.value : NaN);
          if (intervalFn) {
            this.intervalBindings.set(stmt.name, intervalFn);
          }
          this.builder.emitAssign(varName, value2);
          return;
        }
        if (stmt.init.kind === "struct_lit" && stmt.type?.kind === "struct") {
          const structName = stmt.type.name.toLowerCase();
          for (const field of stmt.init.fields) {
            const path3 = `rs:heap ${structName}_${stmt.name}.${field.name}`;
            const fieldValue = this.lowerExpr(field.value);
            if (fieldValue.kind === "const") {
              this.builder.emitRaw(`data modify storage ${path3} set value ${fieldValue.value}`);
            } else if (fieldValue.kind === "var") {
              this.builder.emitRaw(`execute store result storage ${path3} int 1 run scoreboard players get ${fieldValue.name} rs`);
            }
          }
          return;
        }
        if ((stmt.init.kind === "call" || stmt.init.kind === "static_call") && stmt.type?.kind === "struct") {
          this.lowerExpr(stmt.init);
          const structDecl = this.structDecls.get(stmt.type.name);
          if (structDecl) {
            const structName = stmt.type.name.toLowerCase();
            for (const field of structDecl.fields) {
              const srcPath = `rs:heap __ret_struct.${field.name}`;
              const dstPath = `rs:heap ${structName}_${stmt.name}.${field.name}`;
              this.builder.emitRaw(`data modify storage ${dstPath} set from storage ${srcPath}`);
            }
          }
          return;
        }
        if (stmt.init.kind === "array_lit") {
          this.builder.emitRaw(`data modify storage rs:heap ${stmt.name} set value []`);
          for (const elem of stmt.init.elements) {
            const elemValue = this.lowerExpr(elem);
            if (elemValue.kind === "const") {
              this.builder.emitRaw(`data modify storage rs:heap ${stmt.name} append value ${elemValue.value}`);
            } else if (elemValue.kind === "var") {
              this.builder.emitRaw(`data modify storage rs:heap ${stmt.name} append value 0`);
              this.builder.emitRaw(`execute store result storage rs:heap ${stmt.name}[-1] int 1 run scoreboard players get ${elemValue.name} rs`);
            }
          }
          return;
        }
        if (stmt.init.kind === "call" && stmt.init.fn === "set_new") {
          const setId = `__set_${this.foreachCounter++}`;
          this.builder.emitRaw(`data modify storage rs:sets ${setId} set value []`);
          this.stringValues.set(stmt.name, setId);
          return;
        }
        if (stmt.init.kind === "call" && stmt.init.fn === "spawn_object") {
          const value2 = this.lowerExpr(stmt.init);
          if (value2.kind === "var" && value2.name.startsWith("@e[tag=__rs_obj_")) {
            this.varMap.set(stmt.name, value2.name);
            this.varTypes.set(stmt.name, { kind: "named", name: "void" });
          }
          return;
        }
        const blockPosValue = this.resolveBlockPosExpr(stmt.init);
        if (blockPosValue) {
          this.blockPosVars.set(stmt.name, blockPosValue);
          return;
        }
        const stmtType = stmt.type ? this.normalizeType(stmt.type) : this.inferExprType(stmt.init);
        if (stmtType?.kind === "named" && stmtType.name === "string" && this.storeStringValue(stmt.name, stmt.init)) {
          return;
        }
        const value = this.lowerExpr(stmt.init);
        this.builder.emitAssign(varName, value);
      }
      lowerReturnStmt(stmt) {
        if (stmt.value) {
          if (stmt.value.kind === "struct_lit") {
            for (const field of stmt.value.fields) {
              const path3 = `rs:heap __ret_struct.${field.name}`;
              const fieldValue = this.lowerExpr(field.value);
              if (fieldValue.kind === "const") {
                this.builder.emitRaw(`data modify storage ${path3} set value ${fieldValue.value}`);
              } else if (fieldValue.kind === "var") {
                this.builder.emitRaw(`execute store result storage ${path3} int 1 run scoreboard players get ${fieldValue.name} rs`);
              }
            }
            this.builder.emitReturn({ kind: "const", value: 0 });
            return;
          }
          const value = this.lowerExpr(stmt.value);
          this.builder.emitReturn(value);
        } else {
          this.builder.emitReturn();
        }
      }
      lowerBreakStmt() {
        if (this.loopStack.length === 0) {
          throw new diagnostics_1.DiagnosticError("LoweringError", "break statement outside of loop", { line: 1, col: 1 });
        }
        const loop = this.loopStack[this.loopStack.length - 1];
        this.builder.emitJump(loop.breakLabel);
      }
      lowerContinueStmt() {
        if (this.loopStack.length === 0) {
          throw new diagnostics_1.DiagnosticError("LoweringError", "continue statement outside of loop", { line: 1, col: 1 });
        }
        const loop = this.loopStack[this.loopStack.length - 1];
        this.builder.emitJump(loop.continueLabel);
      }
      lowerIfStmt(stmt) {
        if (stmt.cond.kind === "is_check") {
          this.lowerIsCheckIfStmt(stmt);
          return;
        }
        const condVar = this.lowerExpr(stmt.cond);
        const condName = this.operandToVar(condVar);
        const thenLabel = this.builder.freshLabel("then");
        const elseLabel = this.builder.freshLabel("else");
        const mergeLabel = this.builder.freshLabel("merge");
        this.builder.emitJumpIf(condName, thenLabel, stmt.else_ ? elseLabel : mergeLabel);
        this.builder.startBlock(thenLabel);
        this.lowerBlock(stmt.then);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitJump(mergeLabel);
        }
        if (stmt.else_) {
          this.builder.startBlock(elseLabel);
          this.lowerBlock(stmt.else_);
          if (!this.builder.isBlockSealed()) {
            this.builder.emitJump(mergeLabel);
          }
        }
        this.builder.startBlock(mergeLabel);
      }
      lowerIsCheckIfStmt(stmt) {
        const cond = stmt.cond;
        if (cond.kind !== "is_check") {
          throw new diagnostics_1.DiagnosticError("LoweringError", "Internal error: expected 'is' check condition", stmt.span ?? { line: 0, col: 0 });
        }
        if (stmt.else_) {
          throw new diagnostics_1.DiagnosticError("LoweringError", "'is' checks with else branches are not yet supported", cond.span ?? stmt.span ?? { line: 0, col: 0 });
        }
        const selector = this.exprToEntitySelector(cond.expr);
        if (!selector) {
          throw new diagnostics_1.DiagnosticError("LoweringError", "'is' checks require an entity selector or entity binding", cond.span ?? stmt.span ?? { line: 0, col: 0 });
        }
        const mcType = ENTITY_TO_MC_TYPE[cond.entityType];
        if (!mcType) {
          throw new diagnostics_1.DiagnosticError("LoweringError", `Cannot lower entity type check for '${cond.entityType}'`, cond.span ?? stmt.span ?? { line: 0, col: 0 });
        }
        const thenFnName = `${this.currentFn}/then_${this.foreachCounter++}`;
        this.builder.emitRaw(`execute if entity ${this.appendTypeFilter(selector, mcType)} run function ${this.namespace}:${thenFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.then);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        this.functions.push(this.builder.build(thenFnName, [], false));
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerWhileStmt(stmt) {
        const checkLabel = this.builder.freshLabel("loop_check");
        const bodyLabel = this.builder.freshLabel("loop_body");
        const exitLabel = this.builder.freshLabel("loop_exit");
        this.builder.emitJump(checkLabel);
        this.builder.startBlock(checkLabel);
        const condVar = this.lowerExpr(stmt.cond);
        const condName = this.operandToVar(condVar);
        this.builder.emitJumpIf(condName, bodyLabel, exitLabel);
        this.loopStack.push({ breakLabel: exitLabel, continueLabel: checkLabel });
        this.builder.startBlock(bodyLabel);
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitJump(checkLabel);
        }
        this.loopStack.pop();
        this.builder.startBlock(exitLabel);
      }
      lowerForStmt(stmt) {
        if (stmt.init) {
          this.lowerStmt(stmt.init);
        }
        const checkLabel = this.builder.freshLabel("for_check");
        const bodyLabel = this.builder.freshLabel("for_body");
        const continueLabel = this.builder.freshLabel("for_continue");
        const exitLabel = this.builder.freshLabel("for_exit");
        this.builder.emitJump(checkLabel);
        this.builder.startBlock(checkLabel);
        const condVar = this.lowerExpr(stmt.cond);
        const condName = this.operandToVar(condVar);
        this.builder.emitJumpIf(condName, bodyLabel, exitLabel);
        this.loopStack.push({ breakLabel: exitLabel, continueLabel });
        this.builder.startBlock(bodyLabel);
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitJump(continueLabel);
        }
        this.builder.startBlock(continueLabel);
        this.lowerExpr(stmt.step);
        this.builder.emitJump(checkLabel);
        this.loopStack.pop();
        this.builder.startBlock(exitLabel);
      }
      lowerForRangeStmt(stmt) {
        const loopVar = `$${stmt.varName}`;
        const subFnName = `${this.currentFn}/__for_${this.foreachCounter++}`;
        this.varMap.set(stmt.varName, loopVar);
        const startVal = this.lowerExpr(stmt.start);
        if (startVal.kind === "const") {
          this.builder.emitRaw(`scoreboard players set ${loopVar} rs ${startVal.value}`);
        } else if (startVal.kind === "var") {
          this.builder.emitRaw(`scoreboard players operation ${loopVar} rs = ${startVal.name} rs`);
        }
        this.builder.emitRaw(`function ${this.namespace}:${subFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedContext = this.currentContext;
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.currentContext = savedContext;
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.body);
        this.builder.emitRaw(`scoreboard players add ${loopVar} rs 1`);
        const endVal = this.lowerExpr(stmt.end);
        const endNum = endVal.kind === "const" ? endVal.value - 1 : "?";
        this.builder.emitRaw(`execute if score ${loopVar} rs matches ..${endNum} run function ${this.namespace}:${subFnName}`);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const subFn = this.builder.build(subFnName, [], false);
        this.functions.push(subFn);
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.currentContext = savedContext;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerForeachStmt(stmt) {
        if (stmt.iterable.kind !== "selector") {
          this.lowerArrayForeachStmt(stmt);
          return;
        }
        const subFnName = `${this.currentFn}/foreach_${this.foreachCounter++}`;
        const selector = this.exprToString(stmt.iterable);
        const execContext = stmt.executeContext ? ` ${stmt.executeContext}` : "";
        this.builder.emitRaw(`execute as ${selector}${execContext} run function ${this.namespace}:${subFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedContext = this.currentContext;
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.currentContext = { binding: stmt.binding };
        this.blockPosVars = new Map(savedBlockPosVars);
        this.varMap.set(stmt.binding, "@s");
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const subFn = this.builder.build(subFnName, [], false);
        this.functions.push(subFn);
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.currentContext = savedContext;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerMatchStmt(stmt) {
        const subject = this.operandToVar(this.lowerExpr(stmt.expr));
        const matchedVar = this.builder.freshTemp();
        this.builder.emitAssign(matchedVar, { kind: "const", value: 0 });
        let defaultArm = null;
        for (const arm of stmt.arms) {
          if (arm.pattern === null) {
            defaultArm = arm;
            continue;
          }
          let matchCondition;
          if (arm.pattern.kind === "range_lit") {
            const range = arm.pattern.range;
            if (range.min !== void 0 && range.max !== void 0) {
              matchCondition = `${range.min}..${range.max}`;
            } else if (range.min !== void 0) {
              matchCondition = `${range.min}..`;
            } else if (range.max !== void 0) {
              matchCondition = `..${range.max}`;
            } else {
              matchCondition = "0..";
            }
          } else {
            const patternValue = this.lowerExpr(arm.pattern);
            if (patternValue.kind !== "const") {
              throw new Error("Match patterns must lower to compile-time constants");
            }
            matchCondition = String(patternValue.value);
          }
          const subFnName = `${this.currentFn}/match_${this.foreachCounter++}`;
          this.builder.emitRaw(`execute if score ${matchedVar} rs matches ..0 if score ${subject} rs matches ${matchCondition} run function ${this.namespace}:${subFnName}`);
          this.emitMatchArmSubFunction(subFnName, matchedVar, arm.body, true);
        }
        if (defaultArm) {
          const subFnName = `${this.currentFn}/match_${this.foreachCounter++}`;
          this.builder.emitRaw(`execute if score ${matchedVar} rs matches ..0 run function ${this.namespace}:${subFnName}`);
          this.emitMatchArmSubFunction(subFnName, matchedVar, defaultArm.body, false);
        }
      }
      emitMatchArmSubFunction(name, matchedVar, body, setMatched) {
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedContext = this.currentContext;
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.currentContext = savedContext;
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        if (setMatched) {
          this.builder.emitRaw(`scoreboard players set ${matchedVar} rs 1`);
        }
        this.lowerBlock(body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        this.functions.push(this.builder.build(name, [], false));
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.currentContext = savedContext;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerArrayForeachStmt(stmt) {
        const arrayName = this.getArrayStorageName(stmt.iterable);
        if (!arrayName) {
          this.builder.emitRaw("# Unsupported foreach iterable");
          return;
        }
        const arrayType = this.inferExprType(stmt.iterable);
        const bindingVar = `$${stmt.binding}`;
        const indexVar = this.builder.freshTemp();
        const lengthVar = this.builder.freshTemp();
        const condVar = this.builder.freshTemp();
        const oneVar = this.builder.freshTemp();
        const savedBinding = this.varMap.get(stmt.binding);
        const savedType = this.varTypes.get(stmt.binding);
        this.varMap.set(stmt.binding, bindingVar);
        if (arrayType?.kind === "array") {
          this.varTypes.set(stmt.binding, arrayType.elem);
        }
        this.builder.emitAssign(indexVar, { kind: "const", value: 0 });
        this.builder.emitAssign(oneVar, { kind: "const", value: 1 });
        this.builder.emitRaw(`execute store result score ${lengthVar} rs run data get storage rs:heap ${arrayName}`);
        const checkLabel = this.builder.freshLabel("foreach_array_check");
        const bodyLabel = this.builder.freshLabel("foreach_array_body");
        const exitLabel = this.builder.freshLabel("foreach_array_exit");
        this.builder.emitJump(checkLabel);
        this.builder.startBlock(checkLabel);
        this.builder.emitCmp(condVar, { kind: "var", name: indexVar }, "<", { kind: "var", name: lengthVar });
        this.builder.emitJumpIf(condVar, bodyLabel, exitLabel);
        this.builder.startBlock(bodyLabel);
        const element = this.readArrayElement(arrayName, { kind: "var", name: indexVar });
        this.builder.emitAssign(bindingVar, element);
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitRaw(`scoreboard players operation ${indexVar} rs += ${oneVar} rs`);
          this.builder.emitJump(checkLabel);
        }
        this.builder.startBlock(exitLabel);
        if (savedBinding) {
          this.varMap.set(stmt.binding, savedBinding);
        } else {
          this.varMap.delete(stmt.binding);
        }
        if (savedType) {
          this.varTypes.set(stmt.binding, savedType);
        } else {
          this.varTypes.delete(stmt.binding);
        }
      }
      lowerAsBlockStmt(stmt) {
        const selector = this.selectorToString(stmt.selector);
        const subFnName = `${this.currentFn}/as_${this.foreachCounter++}`;
        this.builder.emitRaw(`execute as ${selector} run function ${this.namespace}:${subFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const subFn = this.builder.build(subFnName, [], false);
        this.functions.push(subFn);
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerAtBlockStmt(stmt) {
        const selector = this.selectorToString(stmt.selector);
        const subFnName = `${this.currentFn}/at_${this.foreachCounter++}`;
        this.builder.emitRaw(`execute at ${selector} run function ${this.namespace}:${subFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const subFn = this.builder.build(subFnName, [], false);
        this.functions.push(subFn);
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerAsAtStmt(stmt) {
        const asSel = this.selectorToString(stmt.as_sel);
        const atSel = this.selectorToString(stmt.at_sel);
        const subFnName = `${this.currentFn}/as_at_${this.foreachCounter++}`;
        this.builder.emitRaw(`execute as ${asSel} at ${atSel} run function ${this.namespace}:${subFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const subFn = this.builder.build(subFnName, [], false);
        this.functions.push(subFn);
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.blockPosVars = savedBlockPosVars;
      }
      lowerExecuteStmt(stmt) {
        const parts = ["execute"];
        for (const sub of stmt.subcommands) {
          switch (sub.kind) {
            // Context modifiers
            case "as":
              parts.push(`as ${this.selectorToString(sub.selector)}`);
              break;
            case "at":
              parts.push(`at ${this.selectorToString(sub.selector)}`);
              break;
            case "positioned":
              parts.push(`positioned ${sub.x} ${sub.y} ${sub.z}`);
              break;
            case "positioned_as":
              parts.push(`positioned as ${this.selectorToString(sub.selector)}`);
              break;
            case "rotated":
              parts.push(`rotated ${sub.yaw} ${sub.pitch}`);
              break;
            case "rotated_as":
              parts.push(`rotated as ${this.selectorToString(sub.selector)}`);
              break;
            case "facing":
              parts.push(`facing ${sub.x} ${sub.y} ${sub.z}`);
              break;
            case "facing_entity":
              parts.push(`facing entity ${this.selectorToString(sub.selector)} ${sub.anchor}`);
              break;
            case "anchored":
              parts.push(`anchored ${sub.anchor}`);
              break;
            case "align":
              parts.push(`align ${sub.axes}`);
              break;
            case "in":
              parts.push(`in ${sub.dimension}`);
              break;
            case "on":
              parts.push(`on ${sub.relation}`);
              break;
            case "summon":
              parts.push(`summon ${sub.entity}`);
              break;
            // Conditions
            case "if_entity":
              if (sub.selector) {
                parts.push(`if entity ${this.selectorToString(sub.selector)}`);
              } else if (sub.varName) {
                const sel = { kind: "@s", filters: sub.filters };
                parts.push(`if entity ${this.selectorToString(sel)}`);
              }
              break;
            case "unless_entity":
              if (sub.selector) {
                parts.push(`unless entity ${this.selectorToString(sub.selector)}`);
              } else if (sub.varName) {
                const sel = { kind: "@s", filters: sub.filters };
                parts.push(`unless entity ${this.selectorToString(sel)}`);
              }
              break;
            case "if_block":
              parts.push(`if block ${sub.pos[0]} ${sub.pos[1]} ${sub.pos[2]} ${sub.block}`);
              break;
            case "unless_block":
              parts.push(`unless block ${sub.pos[0]} ${sub.pos[1]} ${sub.pos[2]} ${sub.block}`);
              break;
            case "if_score":
              parts.push(`if score ${sub.target} ${sub.targetObj} ${sub.op} ${sub.source} ${sub.sourceObj}`);
              break;
            case "unless_score":
              parts.push(`unless score ${sub.target} ${sub.targetObj} ${sub.op} ${sub.source} ${sub.sourceObj}`);
              break;
            case "if_score_range":
              parts.push(`if score ${sub.target} ${sub.targetObj} matches ${sub.range}`);
              break;
            case "unless_score_range":
              parts.push(`unless score ${sub.target} ${sub.targetObj} matches ${sub.range}`);
              break;
            // Store
            case "store_result":
              parts.push(`store result score ${sub.target} ${sub.targetObj}`);
              break;
            case "store_success":
              parts.push(`store success score ${sub.target} ${sub.targetObj}`);
              break;
          }
        }
        const subFnName = `${this.currentFn}/exec_${this.foreachCounter++}`;
        this.builder.emitRaw(`${parts.join(" ")} run function ${this.namespace}:${subFnName}`);
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedBlockPosVars = new Map(this.blockPosVars);
        this.builder = new LoweringBuilder();
        this.varMap = new Map(savedVarMap);
        this.blockPosVars = new Map(savedBlockPosVars);
        this.builder.startBlock("entry");
        this.lowerBlock(stmt.body);
        if (!this.builder.isBlockSealed()) {
          this.builder.emitReturn();
        }
        const subFn = this.builder.build(subFnName, [], false);
        this.functions.push(subFn);
        this.builder = savedBuilder;
        this.varMap = savedVarMap;
        this.blockPosVars = savedBlockPosVars;
      }
      // -------------------------------------------------------------------------
      // Expression Lowering
      // -------------------------------------------------------------------------
      lowerExpr(expr) {
        switch (expr.kind) {
          case "int_lit":
            return { kind: "const", value: expr.value };
          case "float_lit":
            return { kind: "const", value: Math.round(expr.value * 1e3) };
          case "byte_lit":
            return { kind: "const", value: expr.value };
          case "short_lit":
            return { kind: "const", value: expr.value };
          case "long_lit":
            return { kind: "const", value: expr.value };
          case "double_lit":
            return { kind: "const", value: Math.round(expr.value * 1e3) };
          case "bool_lit":
            return { kind: "const", value: expr.value ? 1 : 0 };
          case "str_lit":
            return { kind: "const", value: 0 };
          // Placeholder
          case "mc_name":
            return { kind: "const", value: 0 };
          // Handled inline in exprToString
          case "str_interp":
          case "f_string":
            return { kind: "const", value: 0 };
          case "range_lit":
            return { kind: "const", value: 0 };
          case "blockpos":
            return { kind: "const", value: 0 };
          case "ident": {
            const constValue = this.constValues.get(expr.name);
            if (constValue) {
              return this.lowerConstLiteral(constValue);
            }
            const mapped = this.varMap.get(expr.name);
            if (mapped) {
              if (mapped.startsWith("@")) {
                return { kind: "var", name: mapped };
              }
              return { kind: "var", name: mapped };
            }
            return { kind: "var", name: `$${expr.name}` };
          }
          case "member":
            if (expr.obj.kind === "ident" && this.enumDefs.has(expr.obj.name)) {
              const variants = this.enumDefs.get(expr.obj.name);
              const value = variants.get(expr.field);
              if (value === void 0) {
                throw new Error(`Unknown enum variant ${expr.obj.name}.${expr.field}`);
              }
              return { kind: "const", value };
            }
            return this.lowerMemberExpr(expr);
          case "selector":
            return { kind: "var", name: this.selectorToString(expr.sel) };
          case "binary":
            return this.lowerBinaryExpr(expr);
          case "is_check":
            throw new diagnostics_1.DiagnosticError("LoweringError", "'is' checks are only supported as if conditions", expr.span ?? { line: 0, col: 0 });
          case "unary":
            return this.lowerUnaryExpr(expr);
          case "assign":
            return this.lowerAssignExpr(expr);
          case "call":
            return this.lowerCallExpr(expr);
          case "static_call":
            return this.lowerStaticCallExpr(expr);
          case "invoke":
            return this.lowerInvokeExpr(expr);
          case "member_assign":
            return this.lowerMemberAssign(expr);
          case "index":
            return this.lowerIndexExpr(expr);
          case "struct_lit":
            return { kind: "const", value: 0 };
          case "array_lit":
            return { kind: "const", value: 0 };
          case "lambda":
            throw new Error("Lambda expressions must be used in a function context");
        }
        throw new Error(`Unhandled expression kind: ${expr.kind}`);
      }
      lowerMemberExpr(expr) {
        if (expr.obj.kind === "ident") {
          const varType = this.varTypes.get(expr.obj.name);
          const mapped = this.varMap.get(expr.obj.name);
          if (mapped && mapped.startsWith("@e[tag=__rs_obj_")) {
            const dst = this.builder.freshTemp();
            this.builder.emitRaw(`scoreboard players operation ${dst} rs = ${mapped} rs`);
            return { kind: "var", name: dst };
          }
          if (varType?.kind === "struct") {
            const structName = varType.name.toLowerCase();
            const path3 = `rs:heap ${structName}_${expr.obj.name}.${expr.field}`;
            const dst = this.builder.freshTemp();
            this.builder.emitRaw(`execute store result score ${dst} rs run data get storage ${path3}`);
            return { kind: "var", name: dst };
          }
          if (varType?.kind === "array" && expr.field === "len") {
            const dst = this.builder.freshTemp();
            this.builder.emitRaw(`execute store result score ${dst} rs run data get storage rs:heap ${expr.obj.name}`);
            return { kind: "var", name: dst };
          }
        }
        return { kind: "var", name: `$${expr.obj.name}_${expr.field}` };
      }
      lowerMemberAssign(expr) {
        if (expr.obj.kind === "ident") {
          const varType = this.varTypes.get(expr.obj.name);
          const mapped = this.varMap.get(expr.obj.name);
          if (mapped && mapped.startsWith("@e[tag=__rs_obj_")) {
            const value2 = this.lowerExpr(expr.value);
            if (expr.op === "=") {
              if (value2.kind === "const") {
                this.builder.emitRaw(`scoreboard players set ${mapped} rs ${value2.value}`);
              } else if (value2.kind === "var") {
                this.builder.emitRaw(`scoreboard players operation ${mapped} rs = ${value2.name} rs`);
              }
            } else {
              const binOp = expr.op.slice(0, -1);
              const opMap = { "+": "+=", "-": "-=", "*": "*=", "/": "/=", "%": "%=" };
              if (value2.kind === "const") {
                const constTemp = this.builder.freshTemp();
                this.builder.emitAssign(constTemp, value2);
                this.builder.emitRaw(`scoreboard players operation ${mapped} rs ${opMap[binOp]} ${constTemp} rs`);
              } else if (value2.kind === "var") {
                this.builder.emitRaw(`scoreboard players operation ${mapped} rs ${opMap[binOp]} ${value2.name} rs`);
              }
            }
            return { kind: "const", value: 0 };
          }
          if (varType?.kind === "struct") {
            const structName = varType.name.toLowerCase();
            const path3 = `rs:heap ${structName}_${expr.obj.name}.${expr.field}`;
            const value2 = this.lowerExpr(expr.value);
            if (expr.op === "=") {
              if (value2.kind === "const") {
                this.builder.emitRaw(`data modify storage ${path3} set value ${value2.value}`);
              } else if (value2.kind === "var") {
                this.builder.emitRaw(`execute store result storage ${path3} int 1 run scoreboard players get ${value2.name} rs`);
              }
            } else {
              const dst = this.builder.freshTemp();
              this.builder.emitRaw(`execute store result score ${dst} rs run data get storage ${path3}`);
              const binOp = expr.op.slice(0, -1);
              this.builder.emitBinop(dst, { kind: "var", name: dst }, binOp, value2);
              this.builder.emitRaw(`execute store result storage ${path3} int 1 run scoreboard players get ${dst} rs`);
            }
            return { kind: "const", value: 0 };
          }
        }
        const varName = `$${expr.obj.name}_${expr.field}`;
        const value = this.lowerExpr(expr.value);
        this.builder.emitAssign(varName, value);
        return { kind: "var", name: varName };
      }
      lowerIndexExpr(expr) {
        const arrayName = this.getArrayStorageName(expr.obj);
        if (arrayName) {
          return this.readArrayElement(arrayName, this.lowerExpr(expr.index));
        }
        return { kind: "const", value: 0 };
      }
      lowerBinaryExpr(expr) {
        const left = this.lowerExpr(expr.left);
        const right = this.lowerExpr(expr.right);
        const dst = this.builder.freshTemp();
        if (["&&", "||"].includes(expr.op)) {
          if (expr.op === "&&") {
            this.builder.emitAssign(dst, left);
            const rightVar = this.operandToVar(right);
            this.builder.emitRaw(`execute if score ${dst} rs matches 1.. run scoreboard players operation ${dst} rs = ${rightVar} rs`);
          } else {
            this.builder.emitAssign(dst, left);
            const rightVar = this.operandToVar(right);
            this.builder.emitRaw(`execute if score ${dst} rs matches ..0 run scoreboard players operation ${dst} rs = ${rightVar} rs`);
          }
          return { kind: "var", name: dst };
        }
        if (["==", "!=", "<", "<=", ">", ">="].includes(expr.op)) {
          this.builder.emitCmp(dst, left, expr.op, right);
        } else {
          const isFloatOp = this.isFloatExpr(expr.left) || this.isFloatExpr(expr.right);
          if (isFloatOp && (expr.op === "*" || expr.op === "/")) {
            if (expr.op === "*") {
              this.builder.emitBinop(dst, left, "*", right);
              const constDiv = this.builder.freshTemp();
              this.builder.emitAssign(constDiv, { kind: "const", value: 1e3 });
              this.builder.emitRaw(`scoreboard players operation ${dst} rs /= ${constDiv} rs`);
            } else {
              const constMul = this.builder.freshTemp();
              this.builder.emitAssign(constMul, { kind: "const", value: 1e3 });
              this.builder.emitAssign(dst, left);
              this.builder.emitRaw(`scoreboard players operation ${dst} rs *= ${constMul} rs`);
              const rightVar = this.operandToVar(right);
              this.builder.emitRaw(`scoreboard players operation ${dst} rs /= ${rightVar} rs`);
            }
            return { kind: "var", name: dst };
          }
          this.builder.emitBinop(dst, left, expr.op, right);
        }
        return { kind: "var", name: dst };
      }
      isFloatExpr(expr) {
        if (expr.kind === "float_lit")
          return true;
        if (expr.kind === "ident") {
          return this.floatVars.has(expr.name);
        }
        if (expr.kind === "binary") {
          return this.isFloatExpr(expr.left) || this.isFloatExpr(expr.right);
        }
        return false;
      }
      lowerUnaryExpr(expr) {
        const operand = this.lowerExpr(expr.operand);
        const dst = this.builder.freshTemp();
        if (expr.op === "!") {
          this.builder.emitCmp(dst, operand, "==", { kind: "const", value: 0 });
        } else if (expr.op === "-") {
          this.builder.emitBinop(dst, { kind: "const", value: 0 }, "-", operand);
        }
        return { kind: "var", name: dst };
      }
      lowerAssignExpr(expr) {
        if (this.constValues.has(expr.target)) {
          throw new diagnostics_1.DiagnosticError("LoweringError", `Cannot assign to constant '${expr.target}'`, getSpan(expr) ?? { line: 1, col: 1 });
        }
        const globalInfo = this.globalNames.get(expr.target);
        if (globalInfo && !globalInfo.mutable) {
          throw new diagnostics_1.DiagnosticError("LoweringError", `Cannot assign to constant '${expr.target}'`, getSpan(expr) ?? { line: 1, col: 1 });
        }
        const blockPosValue = this.resolveBlockPosExpr(expr.value);
        if (blockPosValue) {
          this.blockPosVars.set(expr.target, blockPosValue);
          return { kind: "const", value: 0 };
        }
        this.blockPosVars.delete(expr.target);
        const targetType = this.varTypes.get(expr.target);
        if (targetType?.kind === "named" && targetType.name === "string" && this.storeStringValue(expr.target, expr.value)) {
          return { kind: "const", value: 0 };
        }
        const varName = this.varMap.get(expr.target) ?? `$${expr.target}`;
        const value = this.lowerExpr(expr.value);
        if (expr.op === "=") {
          this.builder.emitAssign(varName, value);
        } else {
          const binOp = expr.op.slice(0, -1);
          const dst = this.builder.freshTemp();
          this.builder.emitBinop(dst, { kind: "var", name: varName }, binOp, value);
          this.builder.emitAssign(varName, { kind: "var", name: dst });
        }
        return { kind: "var", name: varName };
      }
      lowerCallExpr(expr) {
        if (expr.fn === "str_len") {
          const storagePath = this.getStringStoragePath(expr.args[0]);
          if (storagePath) {
            const dst = this.builder.freshTemp();
            this.builder.emitRaw(`execute store result score ${dst} rs run data get storage ${storagePath}`);
            return { kind: "var", name: dst };
          }
          const staticString = this.resolveStaticString(expr.args[0]);
          if (staticString !== null) {
            return { kind: "const", value: Array.from(staticString).length };
          } else {
            const dst = this.builder.freshTemp();
            this.builder.emitAssign(dst, { kind: "const", value: 0 });
            return { kind: "var", name: dst };
          }
        }
        if (expr.fn in BUILTINS2) {
          return this.lowerBuiltinCall(expr.fn, expr.args, getSpan(expr));
        }
        if (expr.fn === "__entity_tag") {
          const entity = this.exprToString(expr.args[0]);
          const tagName = this.exprToString(expr.args[1]);
          this.builder.emitRaw(`tag ${entity} add ${tagName}`);
          return { kind: "const", value: 0 };
        }
        if (expr.fn === "__entity_untag") {
          const entity = this.exprToString(expr.args[0]);
          const tagName = this.exprToString(expr.args[1]);
          this.builder.emitRaw(`tag ${entity} remove ${tagName}`);
          return { kind: "const", value: 0 };
        }
        if (expr.fn === "__entity_has_tag") {
          const entity = this.exprToString(expr.args[0]);
          const tagName = this.exprToString(expr.args[1]);
          const dst = this.builder.freshTemp();
          this.builder.emitRaw(`execute store result score ${dst} rs if entity ${entity}[tag=${tagName}]`);
          return { kind: "var", name: dst };
        }
        if (expr.fn === "__array_push") {
          const arrExpr = expr.args[0];
          const valueExpr = expr.args[1];
          const arrName = this.getArrayStorageName(arrExpr);
          if (arrName) {
            const value = this.lowerExpr(valueExpr);
            if (value.kind === "const") {
              this.builder.emitRaw(`data modify storage rs:heap ${arrName} append value ${value.value}`);
            } else if (value.kind === "var") {
              this.builder.emitRaw(`data modify storage rs:heap ${arrName} append value 0`);
              this.builder.emitRaw(`execute store result storage rs:heap ${arrName}[-1] int 1 run scoreboard players get ${value.name} rs`);
            }
          }
          return { kind: "const", value: 0 };
        }
        if (expr.fn === "__array_pop") {
          const arrName = this.getArrayStorageName(expr.args[0]);
          const dst = this.builder.freshTemp();
          if (arrName) {
            this.builder.emitRaw(`execute store result score ${dst} rs run data get storage rs:heap ${arrName}[-1]`);
            this.builder.emitRaw(`data remove storage rs:heap ${arrName}[-1]`);
          } else {
            this.builder.emitAssign(dst, { kind: "const", value: 0 });
          }
          return { kind: "var", name: dst };
        }
        if (expr.fn === "spawn_object") {
          const x = this.exprToString(expr.args[0]);
          const y = this.exprToString(expr.args[1]);
          const z = this.exprToString(expr.args[2]);
          const tag = `__rs_obj_${this.worldObjCounter++}`;
          this.builder.emitRaw(`summon minecraft:armor_stand ${x} ${y} ${z} {Invisible:1b,Marker:1b,NoGravity:1b,Tags:["${tag}"]}`);
          const selector = `@e[tag=${tag},limit=1]`;
          return { kind: "var", name: selector };
        }
        if (expr.fn === "kill" && expr.args.length === 1 && expr.args[0].kind === "ident") {
          const mapped = this.varMap.get(expr.args[0].name);
          if (mapped && mapped.startsWith("@e[tag=__rs_obj_")) {
            this.builder.emitRaw(`kill ${mapped}`);
            return { kind: "const", value: 0 };
          }
        }
        const callbackTarget = this.resolveFunctionRefByName(expr.fn);
        if (callbackTarget) {
          return this.emitDirectFunctionCall(callbackTarget, expr.args);
        }
        const implMethod = this.resolveInstanceMethod(expr);
        if (implMethod) {
          const receiver = expr.args[0];
          if (receiver?.kind === "ident") {
            const receiverType = this.inferExprType(receiver);
            if (receiverType?.kind === "struct") {
              const structDecl = this.structDecls.get(receiverType.name);
              const structName = receiverType.name.toLowerCase();
              if (structDecl) {
                for (const field of structDecl.fields) {
                  const srcPath = `rs:heap ${structName}_${receiver.name}.${field.name}`;
                  const dstPath = `rs:heap ${structName}_self.${field.name}`;
                  this.builder.emitRaw(`data modify storage ${dstPath} set from storage ${srcPath}`);
                }
              }
            }
          }
          return this.emitMethodCall(implMethod.loweredName, implMethod.fn, expr.args);
        }
        const fnDecl = this.fnDecls.get(expr.fn);
        const defaultArgs = this.functionDefaults.get(expr.fn) ?? [];
        const fullArgs = [...expr.args];
        for (let i = fullArgs.length; i < defaultArgs.length; i++) {
          const defaultExpr = defaultArgs[i];
          if (!defaultExpr) {
            break;
          }
          fullArgs.push(defaultExpr);
        }
        if (fnDecl) {
          const callbackBindings = /* @__PURE__ */ new Map();
          const runtimeArgs = [];
          for (let i = 0; i < fullArgs.length; i++) {
            const param = fnDecl.params[i];
            if (param && this.normalizeType(param.type).kind === "function_type") {
              const functionRef = this.resolveFunctionRefExpr(fullArgs[i]);
              if (!functionRef) {
                throw new Error(`Cannot lower callback argument for parameter '${param.name}'`);
              }
              callbackBindings.set(param.name, functionRef);
              continue;
            }
            runtimeArgs.push(fullArgs[i]);
          }
          const stdlibCallSite = this.getStdlibCallSiteContext(fnDecl, getSpan(expr));
          const targetFn = callbackBindings.size > 0 || stdlibCallSite ? this.ensureSpecializedFunctionWithContext(fnDecl, callbackBindings, stdlibCallSite) : expr.fn;
          const macroParams = this.macroFunctionInfo.get(targetFn);
          if (macroParams && macroParams.length > 0) {
            return this.emitMacroFunctionCall(targetFn, runtimeArgs, macroParams, fnDecl);
          }
          return this.emitDirectFunctionCall(targetFn, runtimeArgs);
        }
        const macroParamsForUnknown = this.macroFunctionInfo.get(expr.fn);
        if (macroParamsForUnknown && macroParamsForUnknown.length > 0) {
          return this.emitMacroFunctionCall(expr.fn, fullArgs, macroParamsForUnknown, void 0);
        }
        return this.emitDirectFunctionCall(expr.fn, fullArgs);
      }
      lowerStaticCallExpr(expr) {
        const method = this.implMethods.get(expr.type)?.get(expr.method);
        const targetFn = method?.loweredName ?? `${expr.type}_${expr.method}`;
        return this.emitMethodCall(targetFn, method?.fn, expr.args);
      }
      lowerInvokeExpr(expr) {
        if (expr.callee.kind === "lambda") {
          if (!Array.isArray(expr.callee.body)) {
            return this.inlineLambdaInvoke(expr.callee, expr.args);
          }
          const lambdaName = this.lowerLambdaExpr(expr.callee);
          return this.emitDirectFunctionCall(lambdaName, expr.args);
        }
        const functionRef = this.resolveFunctionRefExpr(expr.callee);
        if (!functionRef) {
          throw new Error("Cannot invoke a non-function value");
        }
        return this.emitDirectFunctionCall(functionRef, expr.args);
      }
      inlineLambdaInvoke(expr, args) {
        const savedVarMap = new Map(this.varMap);
        const savedVarTypes = new Map(this.varTypes);
        const savedLambdaBindings = new Map(this.lambdaBindings);
        const savedBlockPosVars = new Map(this.blockPosVars);
        for (let i = 0; i < expr.params.length; i++) {
          const param = expr.params[i];
          const temp = this.builder.freshTemp();
          const arg = args[i];
          this.builder.emitAssign(temp, arg ? this.lowerExpr(arg) : { kind: "const", value: 0 });
          this.varMap.set(param.name, temp);
          if (param.type) {
            this.varTypes.set(param.name, this.normalizeType(param.type));
          }
          this.lambdaBindings.delete(param.name);
          this.blockPosVars.delete(param.name);
        }
        const result = this.lowerExpr(expr.body);
        this.varMap = savedVarMap;
        this.varTypes = savedVarTypes;
        this.lambdaBindings = savedLambdaBindings;
        this.blockPosVars = savedBlockPosVars;
        return result;
      }
      emitDirectFunctionCall(fn, args) {
        const loweredArgs = args.map((arg) => this.lowerExpr(arg));
        const dst = this.builder.freshTemp();
        this.builder.emitCall(fn, loweredArgs, dst);
        return { kind: "var", name: dst };
      }
      emitMethodCall(fn, fnDecl, args) {
        const defaultArgs = this.functionDefaults.get(fn) ?? fnDecl?.params.map((param) => param.default) ?? [];
        const fullArgs = [...args];
        for (let i = fullArgs.length; i < defaultArgs.length; i++) {
          const defaultExpr = defaultArgs[i];
          if (!defaultExpr) {
            break;
          }
          fullArgs.push(defaultExpr);
        }
        return this.emitDirectFunctionCall(fn, fullArgs);
      }
      resolveFunctionRefExpr(expr) {
        if (expr.kind === "lambda") {
          return this.lowerLambdaExpr(expr);
        }
        if (expr.kind === "ident") {
          return this.resolveFunctionRefByName(expr.name) ?? (this.fnDecls.has(expr.name) ? expr.name : null);
        }
        return null;
      }
      resolveFunctionRefByName(name) {
        return this.lambdaBindings.get(name) ?? this.currentCallbackBindings.get(name) ?? null;
      }
      ensureSpecializedFunction(fn, callbackBindings) {
        return this.ensureSpecializedFunctionWithContext(fn, callbackBindings);
      }
      ensureSpecializedFunctionWithContext(fn, callbackBindings, stdlibCallSite) {
        const parts = [...callbackBindings.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([param, target]) => `${param}_${target.replace(/[^a-zA-Z0-9_]/g, "_")}`);
        const callSiteHash = stdlibCallSite ? this.shortHash(this.serializeCallSite(stdlibCallSite)) : null;
        if (callSiteHash) {
          parts.push(`callsite_${callSiteHash}`);
        }
        const key = `${fn.name}::${parts.join("::")}`;
        const cached = this.specializedFunctions.get(key);
        if (cached) {
          return cached;
        }
        const specializedName = `${fn.name}__${parts.join("__")}`;
        this.specializedFunctions.set(key, specializedName);
        this.withSavedFunctionState(() => {
          this.lowerFn(fn, { name: specializedName, callbackBindings, stdlibCallSite });
        });
        return specializedName;
      }
      lowerLambdaExpr(expr) {
        const lambdaName = `__lambda_${this.lambdaCounter++}`;
        const lambdaFn = {
          name: lambdaName,
          params: expr.params.map((param) => ({
            name: param.name,
            type: param.type ?? { kind: "named", name: "int" }
          })),
          returnType: expr.returnType ?? this.inferLambdaReturnType(expr),
          decorators: [],
          body: Array.isArray(expr.body) ? expr.body : [{ kind: "return", value: expr.body }]
        };
        this.withSavedFunctionState(() => {
          this.lowerFn(lambdaFn);
        });
        return lambdaName;
      }
      withSavedFunctionState(callback) {
        const savedCurrentFn = this.currentFn;
        const savedStdlibCallSite = this.currentStdlibCallSite;
        const savedForeachCounter = this.foreachCounter;
        const savedBuilder = this.builder;
        const savedVarMap = new Map(this.varMap);
        const savedLambdaBindings = new Map(this.lambdaBindings);
        const savedIntervalBindings = new Map(this.intervalBindings);
        const savedCallbackBindings = new Map(this.currentCallbackBindings);
        const savedContext = this.currentContext;
        const savedBlockPosVars = new Map(this.blockPosVars);
        const savedStringValues = new Map(this.stringValues);
        const savedVarTypes = new Map(this.varTypes);
        const savedCurrentFnParamNames = new Set(this.currentFnParamNames);
        const savedCurrentFnMacroParams = new Set(this.currentFnMacroParams);
        try {
          return callback();
        } finally {
          this.currentFn = savedCurrentFn;
          this.currentStdlibCallSite = savedStdlibCallSite;
          this.foreachCounter = savedForeachCounter;
          this.builder = savedBuilder;
          this.varMap = savedVarMap;
          this.lambdaBindings = savedLambdaBindings;
          this.intervalBindings = savedIntervalBindings;
          this.currentCallbackBindings = savedCallbackBindings;
          this.currentContext = savedContext;
          this.blockPosVars = savedBlockPosVars;
          this.stringValues = savedStringValues;
          this.varTypes = savedVarTypes;
          this.currentFnParamNames = savedCurrentFnParamNames;
          this.currentFnMacroParams = savedCurrentFnMacroParams;
        }
      }
      lowerBuiltinCall(name, args, callSpan) {
        const richTextCommand = this.lowerRichTextBuiltin(name, args);
        if (richTextCommand) {
          this.builder.emitRaw(richTextCommand);
          return { kind: "const", value: 0 };
        }
        if (name === "setTimeout") {
          return this.lowerSetTimeout(args);
        }
        if (name === "setInterval") {
          return this.lowerSetInterval(args);
        }
        if (name === "clearInterval") {
          return this.lowerClearInterval(args, callSpan);
        }
        if (name === "random") {
          const dst = this.builder.freshTemp();
          const min = args[0] ? this.exprToLiteral(args[0]) : "0";
          const max = args[1] ? this.exprToLiteral(args[1]) : "100";
          this.builder.emitRaw(`scoreboard players random ${dst} rs ${min} ${max}`);
          return { kind: "var", name: dst };
        }
        if (name === "random_native") {
          const dst = this.builder.freshTemp();
          const min = args[0] ? this.exprToLiteral(args[0]) : "0";
          const max = args[1] ? this.exprToLiteral(args[1]) : "100";
          this.builder.emitRaw(`execute store result score ${dst} rs run random value ${min} ${max}`);
          return { kind: "var", name: dst };
        }
        if (name === "random_sequence") {
          const sequence = this.exprToString(args[0]);
          const seed = args[1] ? this.exprToLiteral(args[1]) : "0";
          this.builder.emitRaw(`random reset ${sequence} ${seed}`);
          return { kind: "const", value: 0 };
        }
        if (name === "scoreboard_get" || name === "score") {
          const dst = this.builder.freshTemp();
          const player = this.exprToTargetString(args[0]);
          const objective = this.resolveScoreboardObjective(args[0], args[1], callSpan);
          this.builder.emitRaw(`execute store result score ${dst} rs run scoreboard players get ${player} ${objective}`);
          return { kind: "var", name: dst };
        }
        if (name === "scoreboard_set") {
          const player = this.exprToTargetString(args[0]);
          const objective = this.resolveScoreboardObjective(args[0], args[1], callSpan);
          const value = this.lowerExpr(args[2]);
          if (value.kind === "const") {
            this.builder.emitRaw(`scoreboard players set ${player} ${objective} ${value.value}`);
          } else if (value.kind === "var") {
            this.builder.emitRaw(`execute store result score ${player} ${objective} run scoreboard players get ${value.name} rs`);
          }
          return { kind: "const", value: 0 };
        }
        if (name === "scoreboard_display") {
          const slot = this.exprToString(args[0]);
          const objective = this.resolveScoreboardObjective(void 0, args[1], callSpan);
          this.builder.emitRaw(`scoreboard objectives setdisplay ${slot} ${objective}`);
          return { kind: "const", value: 0 };
        }
        if (name === "scoreboard_hide") {
          const slot = this.exprToString(args[0]);
          this.builder.emitRaw(`scoreboard objectives setdisplay ${slot}`);
          return { kind: "const", value: 0 };
        }
        if (name === "scoreboard_add_objective") {
          const objective = this.resolveScoreboardObjective(void 0, args[0], callSpan);
          const criteria = this.exprToString(args[1]);
          const displayName = args[2] ? ` ${this.exprToQuotedString(args[2])}` : "";
          this.builder.emitRaw(`scoreboard objectives add ${objective} ${criteria}${displayName}`);
          return { kind: "const", value: 0 };
        }
        if (name === "scoreboard_remove_objective") {
          const objective = this.resolveScoreboardObjective(void 0, args[0], callSpan);
          this.builder.emitRaw(`scoreboard objectives remove ${objective}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_add") {
          const id = this.exprToString(args[0]);
          const title = this.exprToTextComponent(args[1]);
          this.builder.emitRaw(`bossbar add ${id} ${title}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_set_value") {
          this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} value ${this.exprToString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_set_max") {
          this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} max ${this.exprToString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_set_color") {
          this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} color ${this.exprToString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_set_style") {
          this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} style ${this.exprToString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_set_visible") {
          this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} visible ${this.exprToBoolString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_set_players") {
          this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} players ${this.exprToTargetString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_remove") {
          this.builder.emitRaw(`bossbar remove ${this.exprToString(args[0])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "bossbar_get_value") {
          const dst = this.builder.freshTemp();
          this.builder.emitRaw(`execute store result score ${dst} rs run bossbar get ${this.exprToString(args[0])} value`);
          return { kind: "var", name: dst };
        }
        if (name === "team_add") {
          const team = this.exprToString(args[0]);
          const displayName = args[1] ? ` ${this.exprToTextComponent(args[1])}` : "";
          this.builder.emitRaw(`team add ${team}${displayName}`);
          return { kind: "const", value: 0 };
        }
        if (name === "team_remove") {
          this.builder.emitRaw(`team remove ${this.exprToString(args[0])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "team_join") {
          this.builder.emitRaw(`team join ${this.exprToString(args[0])} ${this.exprToTargetString(args[1])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "team_leave") {
          this.builder.emitRaw(`team leave ${this.exprToTargetString(args[0])}`);
          return { kind: "const", value: 0 };
        }
        if (name === "team_option") {
          const team = this.exprToString(args[0]);
          const option = this.exprToString(args[1]);
          const value = this.isTeamTextOption(option) ? this.exprToTextComponent(args[2]) : this.exprToString(args[2]);
          this.builder.emitRaw(`team modify ${team} ${option} ${value}`);
          return { kind: "const", value: 0 };
        }
        if (name === "data_get") {
          const dst = this.builder.freshTemp();
          const targetType = this.exprToString(args[0]);
          const target = targetType === "entity" ? this.exprToTargetString(args[1]) : this.exprToString(args[1]);
          const path3 = this.exprToString(args[2]);
          const scale = args[3] ? this.exprToString(args[3]) : "1";
          this.builder.emitRaw(`execute store result score ${dst} rs run data get ${targetType} ${target} ${path3} ${scale}`);
          return { kind: "var", name: dst };
        }
        if (name === "data_merge") {
          const target = args[0];
          const nbt = args[1];
          const nbtStr = this.exprToSnbt ? this.exprToSnbt(nbt) : this.exprToString(nbt);
          if (target.kind === "selector") {
            const sel = this.exprToTargetString(target);
            this.builder.emitRaw(`data merge entity ${sel} ${nbtStr}`);
          } else {
            const targetStr = this.exprToString(target);
            if (targetStr.match(/^~|^\d|^\^/)) {
              this.builder.emitRaw(`data merge block ${targetStr} ${nbtStr}`);
            } else {
              this.builder.emitRaw(`data merge storage ${targetStr} ${nbtStr}`);
            }
          }
          return { kind: "const", value: 0 };
        }
        if (name === "set_new") {
          const setId = `__set_${this.foreachCounter++}`;
          this.builder.emitRaw(`data modify storage rs:sets ${setId} set value []`);
          return { kind: "const", value: 0 };
        }
        if (name === "set_add") {
          const setId = this.exprToString(args[0]);
          const value = this.exprToString(args[1]);
          this.builder.emitRaw(`execute unless data storage rs:sets ${setId}[{value:${value}}] run data modify storage rs:sets ${setId} append value {value:${value}}`);
          return { kind: "const", value: 0 };
        }
        if (name === "set_contains") {
          const dst = this.builder.freshTemp();
          const setId = this.exprToString(args[0]);
          const value = this.exprToString(args[1]);
          this.builder.emitRaw(`execute store result score ${dst} rs if data storage rs:sets ${setId}[{value:${value}}]`);
          return { kind: "var", name: dst };
        }
        if (name === "set_remove") {
          const setId = this.exprToString(args[0]);
          const value = this.exprToString(args[1]);
          this.builder.emitRaw(`data remove storage rs:sets ${setId}[{value:${value}}]`);
          return { kind: "const", value: 0 };
        }
        if (name === "set_clear") {
          const setId = this.exprToString(args[0]);
          this.builder.emitRaw(`data modify storage rs:sets ${setId} set value []`);
          return { kind: "const", value: 0 };
        }
        const coordCommand = this.lowerCoordinateBuiltin(name, args);
        if (coordCommand) {
          this.builder.emitRaw(coordCommand);
          return { kind: "const", value: 0 };
        }
        if (name === "tp_to") {
          this.warnings.push({
            message: "tp_to is deprecated; use tp instead",
            code: "W_DEPRECATED",
            ...callSpan ? { line: callSpan.line, col: callSpan.col } : {}
          });
          const tpResult = this.lowerTpCommandMacroAware(args);
          if (tpResult) {
            this.builder.emitRaw(tpResult.cmd);
          }
          return { kind: "const", value: 0 };
        }
        if (name === "tp") {
          const tpResult = this.lowerTpCommandMacroAware(args);
          if (tpResult) {
            this.builder.emitRaw(tpResult.cmd);
          }
          return { kind: "const", value: 0 };
        }
        const argResults = args.map((arg) => this.exprToBuiltinArg(arg));
        const hasMacroArg = argResults.some((r) => r.macroParam !== void 0);
        if (hasMacroArg) {
          argResults.forEach((r) => {
            if (r.macroParam)
              this.currentFnMacroParams.add(r.macroParam);
          });
        }
        const strArgs = argResults.map((r) => r.str);
        const cmd = BUILTINS2[name]?.(strArgs);
        if (cmd) {
          this.builder.emitRaw(hasMacroArg ? `$${cmd}` : cmd);
        }
        return { kind: "const", value: 0 };
      }
      lowerSetTimeout(args) {
        const delay = this.exprToLiteral(args[0]);
        const callback = args[1];
        if (!callback || callback.kind !== "lambda") {
          throw new diagnostics_1.DiagnosticError("LoweringError", "setTimeout requires a lambda callback", getSpan(callback) ?? { line: 1, col: 1 });
        }
        const fnName = `__timeout_${this.timeoutCounter++}`;
        this.lowerNamedLambdaFunction(fnName, callback);
        this.builder.emitRaw(`schedule function ${this.namespace}:${fnName} ${delay}t`);
        return { kind: "const", value: 0 };
      }
      lowerSetInterval(args) {
        const delay = this.exprToLiteral(args[0]);
        const callback = args[1];
        if (!callback || callback.kind !== "lambda") {
          throw new diagnostics_1.DiagnosticError("LoweringError", "setInterval requires a lambda callback", getSpan(callback) ?? { line: 1, col: 1 });
        }
        const id = this.intervalCounter++;
        const bodyName = `__interval_body_${id}`;
        const fnName = `__interval_${id}`;
        this.lowerNamedLambdaFunction(bodyName, callback);
        this.lowerIntervalWrapperFunction(fnName, bodyName, delay);
        this.intervalFunctions.set(id, fnName);
        this.builder.emitRaw(`schedule function ${this.namespace}:${fnName} ${delay}t`);
        return { kind: "const", value: id };
      }
      lowerClearInterval(args, callSpan) {
        const fnName = this.resolveIntervalFunctionName(args[0]);
        if (!fnName) {
          throw new diagnostics_1.DiagnosticError("LoweringError", "clearInterval requires an interval ID returned from setInterval", callSpan ?? getSpan(args[0]) ?? { line: 1, col: 1 });
        }
        this.builder.emitRaw(`schedule clear ${this.namespace}:${fnName}`);
        return { kind: "const", value: 0 };
      }
      lowerNamedLambdaFunction(name, expr) {
        const lambdaFn = {
          name,
          params: expr.params.map((param) => ({
            name: param.name,
            type: param.type ?? { kind: "named", name: "int" }
          })),
          returnType: expr.returnType ?? this.inferLambdaReturnType(expr),
          decorators: [],
          body: Array.isArray(expr.body) ? expr.body : [{ kind: "return", value: expr.body }]
        };
        this.withSavedFunctionState(() => {
          this.lowerFn(lambdaFn);
        });
      }
      lowerIntervalWrapperFunction(name, bodyName, delay) {
        const intervalFn = {
          name,
          params: [],
          returnType: { kind: "named", name: "void" },
          decorators: [],
          body: [
            { kind: "raw", cmd: `function ${this.namespace}:${bodyName}` },
            { kind: "raw", cmd: `schedule function ${this.namespace}:${name} ${delay}t` }
          ]
        };
        this.withSavedFunctionState(() => {
          this.lowerFn(intervalFn);
        });
      }
      resolveIntervalFunctionName(expr) {
        if (!expr) {
          return null;
        }
        if (expr.kind === "ident") {
          const boundInterval = this.intervalBindings.get(expr.name);
          if (boundInterval) {
            return boundInterval;
          }
          const constValue = this.constValues.get(expr.name);
          if (constValue?.kind === "int_lit") {
            return this.intervalFunctions.get(constValue.value) ?? null;
          }
          return null;
        }
        if (expr.kind === "int_lit") {
          return this.intervalFunctions.get(expr.value) ?? null;
        }
        return null;
      }
      lowerRichTextBuiltin(name, args) {
        const messageArgIndex = this.getRichTextArgIndex(name);
        if (messageArgIndex === null) {
          return null;
        }
        const messageExpr = args[messageArgIndex];
        if (!messageExpr || messageExpr.kind !== "str_interp" && messageExpr.kind !== "f_string") {
          return null;
        }
        const json = this.buildRichTextJson(messageExpr);
        switch (name) {
          case "say":
          case "announce":
            return `tellraw @a ${json}`;
          case "tell":
          case "tellraw":
            return `tellraw ${this.exprToString(args[0])} ${json}`;
          case "title":
            return `title ${this.exprToString(args[0])} title ${json}`;
          case "actionbar":
            return `title ${this.exprToString(args[0])} actionbar ${json}`;
          case "subtitle":
            return `title ${this.exprToString(args[0])} subtitle ${json}`;
          default:
            return null;
        }
      }
      getRichTextArgIndex(name) {
        switch (name) {
          case "say":
          case "announce":
            return 0;
          case "tell":
          case "tellraw":
          case "title":
          case "actionbar":
          case "subtitle":
            return 1;
          default:
            return null;
        }
      }
      buildRichTextJson(expr) {
        const components = [""];
        if (expr.kind === "f_string") {
          for (const part of expr.parts) {
            if (part.kind === "text") {
              if (part.value.length > 0) {
                components.push({ text: part.value });
              }
              continue;
            }
            this.appendRichTextExpr(components, part.expr);
          }
          return JSON.stringify(components);
        }
        for (const part of expr.parts) {
          if (typeof part === "string") {
            if (part.length > 0) {
              components.push({ text: part });
            }
            continue;
          }
          this.appendRichTextExpr(components, part);
        }
        return JSON.stringify(components);
      }
      appendRichTextExpr(components, expr) {
        if (expr.kind === "ident") {
          const constValue = this.constValues.get(expr.name);
          if (constValue) {
            this.appendRichTextExpr(components, constValue);
            return;
          }
          const stringValue = this.stringValues.get(expr.name);
          if (stringValue !== void 0) {
            components.push({ text: stringValue });
            return;
          }
        }
        if (expr.kind === "str_lit") {
          if (expr.value.length > 0) {
            components.push({ text: expr.value });
          }
          return;
        }
        if (expr.kind === "str_interp") {
          for (const part of expr.parts) {
            if (typeof part === "string") {
              if (part.length > 0) {
                components.push({ text: part });
              }
            } else {
              this.appendRichTextExpr(components, part);
            }
          }
          return;
        }
        if (expr.kind === "f_string") {
          for (const part of expr.parts) {
            if (part.kind === "text") {
              if (part.value.length > 0) {
                components.push({ text: part.value });
              }
            } else {
              this.appendRichTextExpr(components, part.expr);
            }
          }
          return;
        }
        if (expr.kind === "bool_lit") {
          components.push({ text: expr.value ? "true" : "false" });
          return;
        }
        if (expr.kind === "int_lit") {
          components.push({ text: expr.value.toString() });
          return;
        }
        if (expr.kind === "float_lit") {
          components.push({ text: expr.value.toString() });
          return;
        }
        const operand = this.lowerExpr(expr);
        if (operand.kind === "const") {
          components.push({ text: operand.value.toString() });
          return;
        }
        components.push({ score: { name: this.operandToVar(operand), objective: "rs" } });
      }
      exprToString(expr) {
        switch (expr.kind) {
          case "int_lit":
            return expr.value.toString();
          case "float_lit":
            return Math.trunc(expr.value).toString();
          case "byte_lit":
            return `${expr.value}b`;
          case "short_lit":
            return `${expr.value}s`;
          case "long_lit":
            return `${expr.value}L`;
          case "double_lit":
            return `${expr.value}d`;
          case "rel_coord":
            return expr.value;
          // ~ or ~5 or ~-3 - output as-is for MC commands
          case "local_coord":
            return expr.value;
          // ^ or ^5 or ^-3 - output as-is for MC commands
          case "bool_lit":
            return expr.value ? "1" : "0";
          case "str_lit":
            return expr.value;
          case "mc_name":
            return expr.value;
          // #health → "health" (no quotes, used as bare MC name)
          case "str_interp":
          case "f_string":
            return this.buildRichTextJson(expr);
          case "blockpos":
            return emitBlockPos(expr);
          case "ident": {
            const constValue = this.constValues.get(expr.name);
            if (constValue) {
              return this.exprToString(constValue);
            }
            const stringValue = this.stringValues.get(expr.name);
            if (stringValue !== void 0) {
              return stringValue;
            }
            const mapped = this.varMap.get(expr.name);
            return mapped ?? `$${expr.name}`;
          }
          case "selector":
            return this.selectorToString(expr.sel);
          case "unary":
            if (expr.op === "-" && expr.operand.kind === "int_lit") {
              return (-expr.operand.value).toString();
            }
            if (expr.op === "-" && expr.operand.kind === "float_lit") {
              return Math.trunc(-expr.operand.value).toString();
            }
            const unaryOp = this.lowerExpr(expr);
            return this.operandToVar(unaryOp);
          default:
            const op = this.lowerExpr(expr);
            return this.operandToVar(op);
        }
      }
      exprToEntitySelector(expr) {
        if (expr.kind === "selector") {
          return this.selectorToString(expr.sel);
        }
        if (expr.kind === "ident") {
          const constValue = this.constValues.get(expr.name);
          if (constValue) {
            return this.exprToEntitySelector(constValue);
          }
          const mapped = this.varMap.get(expr.name);
          if (mapped?.startsWith("@")) {
            return mapped;
          }
        }
        return null;
      }
      appendTypeFilter(selector, mcType) {
        if (selector.endsWith("]")) {
          return `${selector.slice(0, -1)},type=${mcType}]`;
        }
        return `${selector}[type=${mcType}]`;
      }
      exprToSnbt(expr) {
        switch (expr.kind) {
          case "struct_lit": {
            const entries = expr.fields.map((f) => `${f.name}:${this.exprToSnbt(f.value)}`);
            return `{${entries.join(",")}}`;
          }
          case "array_lit": {
            const items = expr.elements.map((e) => this.exprToSnbt(e));
            return `[${items.join(",")}]`;
          }
          case "str_lit":
            return `"${expr.value}"`;
          case "int_lit":
            return String(expr.value);
          case "float_lit":
            return String(expr.value);
          case "byte_lit":
            return `${expr.value}b`;
          case "short_lit":
            return `${expr.value}s`;
          case "long_lit":
            return `${expr.value}L`;
          case "double_lit":
            return `${expr.value}d`;
          case "bool_lit":
            return expr.value ? "1b" : "0b";
          default:
            return this.exprToString(expr);
        }
      }
      exprToTargetString(expr) {
        if (expr.kind === "selector") {
          return this.selectorToString(expr.sel);
        }
        if (expr.kind === "str_lit" && expr.value.startsWith("@")) {
          const span = getSpan(expr);
          this.warnings.push({
            message: `Quoted selector "${expr.value}" is deprecated; pass ${expr.value} without quotes`,
            code: "W_QUOTED_SELECTOR",
            ...span ? { line: span.line, col: span.col } : {}
          });
          return expr.value;
        }
        return this.exprToString(expr);
      }
      exprToLiteral(expr) {
        if (expr.kind === "int_lit")
          return expr.value.toString();
        if (expr.kind === "float_lit")
          return Math.trunc(expr.value).toString();
        return "0";
      }
      exprToQuotedString(expr) {
        return JSON.stringify(this.exprToString(expr));
      }
      exprToTextComponent(expr) {
        return JSON.stringify({ text: this.exprToString(expr) });
      }
      exprToBoolString(expr) {
        if (expr.kind === "bool_lit") {
          return expr.value ? "true" : "false";
        }
        return this.exprToString(expr);
      }
      isTeamTextOption(option) {
        return option === "displayName" || option === "prefix" || option === "suffix";
      }
      exprToScoreboardObjective(expr, span) {
        if (expr.kind === "mc_name") {
          return expr.value;
        }
        const objective = this.exprToString(expr);
        if (objective.startsWith("#") || objective.includes(".")) {
          return objective.startsWith("#") ? objective.slice(1) : objective;
        }
        return `${this.getObjectiveNamespace(span)}.${objective}`;
      }
      resolveScoreboardObjective(playerExpr, objectiveExpr, span) {
        const stdlibInternalObjective = this.tryGetStdlibInternalObjective(playerExpr, objectiveExpr, span);
        if (stdlibInternalObjective) {
          return stdlibInternalObjective;
        }
        return this.exprToScoreboardObjective(objectiveExpr, span);
      }
      getObjectiveNamespace(span) {
        const filePath = this.filePathForSpan(span);
        if (!filePath) {
          return this.namespace;
        }
        return this.isStdlibFile(filePath) ? "rs" : this.namespace;
      }
      tryGetStdlibInternalObjective(playerExpr, objectiveExpr, span) {
        if (!span || !this.currentStdlibCallSite || objectiveExpr.kind !== "mc_name" || objectiveExpr.value !== "rs") {
          return null;
        }
        const filePath = this.filePathForSpan(span);
        if (!filePath || !this.isStdlibFile(filePath)) {
          return null;
        }
        const resourceBase = this.getStdlibInternalResourceBase(playerExpr);
        if (!resourceBase) {
          return null;
        }
        const hash = this.shortHash(this.serializeCallSite(this.currentStdlibCallSite));
        return `rs._${resourceBase}_${hash}`;
      }
      getStdlibInternalResourceBase(playerExpr) {
        if (!playerExpr || playerExpr.kind !== "str_lit") {
          return null;
        }
        const match = playerExpr.value.match(/^([a-z0-9]+)_/);
        return match?.[1] ?? null;
      }
      getStdlibCallSiteContext(fn, exprSpan) {
        const fnFilePath = this.filePathForSpan(getSpan(fn));
        if (!fnFilePath || !this.isStdlibFile(fnFilePath)) {
          return void 0;
        }
        if (this.currentStdlibCallSite) {
          return this.currentStdlibCallSite;
        }
        if (!exprSpan) {
          return void 0;
        }
        return {
          filePath: this.filePathForSpan(exprSpan),
          line: exprSpan.line,
          col: exprSpan.col
        };
      }
      serializeCallSite(callSite) {
        return `${callSite.filePath ?? "<memory>"}:${callSite.line}:${callSite.col}`;
      }
      shortHash(input) {
        let hash = 2166136261;
        for (let i = 0; i < input.length; i++) {
          hash ^= input.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 4);
      }
      isStdlibFile(filePath) {
        const normalized = path2.normalize(filePath);
        const stdlibSegment = `${path2.sep}src${path2.sep}stdlib${path2.sep}`;
        return normalized.includes(stdlibSegment);
      }
      filePathForSpan(span) {
        if (!span) {
          return void 0;
        }
        const line = span.line;
        return this.sourceRanges.find((range) => line >= range.startLine && line <= range.endLine)?.filePath;
      }
      lowerCoordinateBuiltin(name, args) {
        const pos0 = args[0] ? this.resolveBlockPosExpr(args[0]) : null;
        const pos1 = args[1] ? this.resolveBlockPosExpr(args[1]) : null;
        const pos2 = args[2] ? this.resolveBlockPosExpr(args[2]) : null;
        if (name === "setblock") {
          if (args.length === 2 && pos0) {
            return `setblock ${emitBlockPos(pos0)} ${this.exprToString(args[1])}`;
          }
          return null;
        }
        if (name === "fill") {
          if (args.length === 3 && pos0 && pos1) {
            return `fill ${emitBlockPos(pos0)} ${emitBlockPos(pos1)} ${this.exprToString(args[2])}`;
          }
          return null;
        }
        if (name === "clone") {
          if (args.length === 3 && pos0 && pos1 && pos2) {
            return `clone ${emitBlockPos(pos0)} ${emitBlockPos(pos1)} ${emitBlockPos(pos2)}`;
          }
          return null;
        }
        if (name === "summon") {
          if (args.length >= 2 && pos1) {
            const nbt = args[2] ? ` ${this.exprToString(args[2])}` : "";
            return `summon ${this.exprToString(args[0])} ${emitBlockPos(pos1)}${nbt}`;
          }
          return null;
        }
        return null;
      }
      lowerTpCommand(args) {
        const pos0 = args[0] ? this.resolveBlockPosExpr(args[0]) : null;
        const pos1 = args[1] ? this.resolveBlockPosExpr(args[1]) : null;
        if (args.length === 1 && pos0) {
          return `tp ${emitBlockPos(pos0)}`;
        }
        if (args.length === 2) {
          if (pos1) {
            return `tp ${this.exprToString(args[0])} ${emitBlockPos(pos1)}`;
          }
          return `tp ${this.exprToString(args[0])} ${this.exprToString(args[1])}`;
        }
        if (args.length === 4) {
          return `tp ${this.exprToString(args[0])} ${this.exprToString(args[1])} ${this.exprToString(args[2])} ${this.exprToString(args[3])}`;
        }
        return null;
      }
      lowerTpCommandMacroAware(args) {
        const pos0 = args[0] ? this.resolveBlockPosExpr(args[0]) : null;
        const pos1 = args[1] ? this.resolveBlockPosExpr(args[1]) : null;
        if (args.length === 1 && pos0) {
          return { cmd: `tp ${emitBlockPos(pos0)}` };
        }
        if (args.length === 2 && pos1) {
          return { cmd: `tp ${this.exprToString(args[0])} ${emitBlockPos(pos1)}` };
        }
        if (args.length >= 2) {
          const argResults = args.map((a) => this.exprToBuiltinArg(a));
          const hasMacro = argResults.some((r) => r.macroParam !== void 0);
          if (hasMacro) {
            argResults.forEach((r) => {
              if (r.macroParam)
                this.currentFnMacroParams.add(r.macroParam);
            });
            const strs = argResults.map((r) => r.str);
            if (args.length === 2) {
              return { cmd: `$tp ${strs[0]} ${strs[1]}` };
            }
            if (args.length === 4) {
              return { cmd: `$tp ${strs[0]} ${strs[1]} ${strs[2]} ${strs[3]}` };
            }
          }
        }
        const plain = this.lowerTpCommand(args);
        return plain ? { cmd: plain } : null;
      }
      resolveBlockPosExpr(expr) {
        if (expr.kind === "blockpos") {
          return expr;
        }
        if (expr.kind === "ident") {
          return this.blockPosVars.get(expr.name) ?? null;
        }
        return null;
      }
      getArrayStorageName(expr) {
        if (expr.kind === "ident") {
          return expr.name;
        }
        return null;
      }
      inferLambdaReturnType(expr) {
        if (expr.returnType) {
          return this.normalizeType(expr.returnType);
        }
        if (Array.isArray(expr.body)) {
          return { kind: "named", name: "void" };
        }
        return this.inferExprType(expr.body) ?? { kind: "named", name: "void" };
      }
      inferExprType(expr) {
        if (expr.kind === "int_lit")
          return { kind: "named", name: "int" };
        if (expr.kind === "float_lit")
          return { kind: "named", name: "float" };
        if (expr.kind === "bool_lit")
          return { kind: "named", name: "bool" };
        if (expr.kind === "str_lit" || expr.kind === "str_interp")
          return { kind: "named", name: "string" };
        if (expr.kind === "f_string")
          return { kind: "named", name: "format_string" };
        if (expr.kind === "blockpos")
          return { kind: "named", name: "BlockPos" };
        if (expr.kind === "ident") {
          const constValue = this.constValues.get(expr.name);
          if (constValue) {
            switch (constValue.kind) {
              case "int_lit":
                return { kind: "named", name: "int" };
              case "float_lit":
                return { kind: "named", name: "float" };
              case "bool_lit":
                return { kind: "named", name: "bool" };
              case "str_lit":
                return { kind: "named", name: "string" };
            }
          }
          return this.varTypes.get(expr.name);
        }
        if (expr.kind === "lambda") {
          return {
            kind: "function_type",
            params: expr.params.map((param) => this.normalizeType(param.type ?? { kind: "named", name: "int" })),
            return: this.inferLambdaReturnType(expr)
          };
        }
        if (expr.kind === "call") {
          const resolved = this.resolveFunctionRefByName(expr.fn) ?? this.resolveInstanceMethod(expr)?.loweredName ?? expr.fn;
          return this.fnDecls.get(resolved)?.returnType;
        }
        if (expr.kind === "static_call") {
          return this.implMethods.get(expr.type)?.get(expr.method)?.fn.returnType;
        }
        if (expr.kind === "invoke") {
          const calleeType = this.inferExprType(expr.callee);
          if (calleeType?.kind === "function_type") {
            return calleeType.return;
          }
        }
        if (expr.kind === "binary") {
          if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(expr.op)) {
            return { kind: "named", name: "bool" };
          }
          return this.inferExprType(expr.left);
        }
        if (expr.kind === "unary") {
          return expr.op === "!" ? { kind: "named", name: "bool" } : this.inferExprType(expr.operand);
        }
        if (expr.kind === "array_lit") {
          return {
            kind: "array",
            elem: expr.elements[0] ? this.inferExprType(expr.elements[0]) ?? { kind: "named", name: "int" } : { kind: "named", name: "int" }
          };
        }
        if (expr.kind === "member" && expr.obj.kind === "ident" && this.enumDefs.has(expr.obj.name)) {
          return { kind: "enum", name: expr.obj.name };
        }
        return void 0;
      }
      /**
       * Checks a raw() command string for `${...}` interpolation containing runtime variables.
       * - If the interpolated expression is a numeric literal → OK (MC macro syntax).
       * - If the interpolated name is a compile-time constant (in constValues) → OK.
       * - If the interpolated name is a known runtime variable (in varMap) → DiagnosticError.
       * - Unknown names → OK (could be MC macro params or external constants).
       *
       * This catches the common mistake of writing raw("say ${score}") expecting interpolation,
       * which would silently emit a literal `${score}` in the MC command.
       */
      checkRawCommandInterpolation(cmd, span) {
        const interpRe = /\$\{([^}]+)\}/g;
        let match;
        while ((match = interpRe.exec(cmd)) !== null) {
          const name = match[1].trim();
          if (/^\d+(\.\d+)?$/.test(name) || name === "true" || name === "false") {
            continue;
          }
          if (this.constValues.has(name)) {
            continue;
          }
          if (this.varMap.has(name) || this.currentFnParamNames.has(name)) {
            const loc = span ?? { line: 1, col: 1 };
            throw new diagnostics_1.DiagnosticError("LoweringError", `raw() command contains runtime variable interpolation '\${${name}}'. Variables cannot be interpolated into raw commands at compile time. Use f-string messages (say/tell/announce) or MC macro syntax '$(${name})' for MC 1.20.2+ commands.`, loc);
          }
        }
      }
      resolveInstanceMethod(expr) {
        const receiver = expr.args[0];
        if (!receiver) {
          return null;
        }
        const receiverType = this.inferExprType(receiver);
        if (receiverType?.kind !== "struct") {
          return null;
        }
        const method = this.implMethods.get(receiverType.name)?.get(expr.fn);
        if (!method || method.fn.params[0]?.name !== "self") {
          return null;
        }
        return method;
      }
      normalizeType(type) {
        if (type.kind === "array") {
          return { kind: "array", elem: this.normalizeType(type.elem) };
        }
        if (type.kind === "function_type") {
          return {
            kind: "function_type",
            params: type.params.map((param) => this.normalizeType(param)),
            return: this.normalizeType(type.return)
          };
        }
        if ((type.kind === "struct" || type.kind === "enum") && this.enumDefs.has(type.name)) {
          return { kind: "enum", name: type.name };
        }
        return type;
      }
      readArrayElement(arrayName, index) {
        const dst = this.builder.freshTemp();
        if (index.kind === "const") {
          this.builder.emitRaw(`execute store result score ${dst} rs run data get storage rs:heap ${arrayName}[${index.value}]`);
          return { kind: "var", name: dst };
        }
        const macroKey = `__rs_index_${this.foreachCounter++}`;
        const subFnName = `${this.currentFn}/array_get_${this.foreachCounter++}`;
        const indexVar = index.kind === "var" ? index.name : this.operandToVar(index);
        this.builder.emitRaw(`execute store result storage rs:heap ${macroKey} int 1 run scoreboard players get ${indexVar} rs`);
        this.builder.emitRaw(`function ${this.namespace}:${subFnName} with storage rs:heap`);
        this.emitRawSubFunction(subFnName, `$execute store result score ${dst} rs run data get storage rs:heap ${arrayName}[$(${macroKey})]`);
        return { kind: "var", name: dst };
      }
      emitRawSubFunction(name, ...commands) {
        const builder = new LoweringBuilder();
        builder.startBlock("entry");
        for (const cmd of commands) {
          builder.emitRaw(cmd);
        }
        builder.emitReturn();
        this.functions.push(builder.build(name, [], false));
      }
      // -------------------------------------------------------------------------
      // Helpers
      // -------------------------------------------------------------------------
      storeStringValue(name, expr) {
        const value = this.resolveStaticString(expr);
        if (value === null) {
          this.stringValues.delete(name);
          return false;
        }
        this.stringValues.set(name, value);
        this.builder.emitRaw(`data modify storage rs:strings ${name} set value ${JSON.stringify(value)}`);
        return true;
      }
      resolveStaticString(expr) {
        if (!expr) {
          return null;
        }
        if (expr.kind === "str_lit") {
          return expr.value;
        }
        if (expr.kind === "ident") {
          const constValue = this.constValues.get(expr.name);
          if (constValue?.kind === "str_lit") {
            return constValue.value;
          }
          return this.stringValues.get(expr.name) ?? null;
        }
        return null;
      }
      getStringStoragePath(expr) {
        if (!expr || expr.kind !== "ident") {
          return null;
        }
        if (this.stringValues.has(expr.name)) {
          return `rs:strings ${expr.name}`;
        }
        return null;
      }
      lowerConstLiteral(expr) {
        switch (expr.kind) {
          case "int_lit":
            return { kind: "const", value: expr.value };
          case "float_lit":
            return { kind: "const", value: Math.round(expr.value * 1e3) };
          case "bool_lit":
            return { kind: "const", value: expr.value ? 1 : 0 };
          case "str_lit":
            return { kind: "const", value: 0 };
        }
      }
      operandToVar(op) {
        if (op.kind === "var")
          return op.name;
        const dst = this.builder.freshTemp();
        this.builder.emitAssign(dst, op);
        return dst;
      }
      selectorToString(sel) {
        const { kind, filters } = sel;
        if (!filters)
          return this.finalizeSelector(kind);
        const parts = [];
        if (filters.type)
          parts.push(`type=${filters.type}`);
        if (filters.distance)
          parts.push(`distance=${this.rangeToString(filters.distance)}`);
        if (filters.tag)
          filters.tag.forEach((t) => parts.push(`tag=${t}`));
        if (filters.notTag)
          filters.notTag.forEach((t) => parts.push(`tag=!${t}`));
        if (filters.limit !== void 0)
          parts.push(`limit=${filters.limit}`);
        if (filters.sort)
          parts.push(`sort=${filters.sort}`);
        if (filters.scores) {
          const scoreStr = Object.entries(filters.scores).map(([k, v]) => `${k}=${this.rangeToString(v)}`).join(",");
          parts.push(`scores={${scoreStr}}`);
        }
        if (filters.nbt)
          parts.push(`nbt=${filters.nbt}`);
        if (filters.gamemode)
          parts.push(`gamemode=${filters.gamemode}`);
        if (filters.x)
          parts.push(`x=${this.rangeToString(filters.x)}`);
        if (filters.y)
          parts.push(`y=${this.rangeToString(filters.y)}`);
        if (filters.z)
          parts.push(`z=${this.rangeToString(filters.z)}`);
        if (filters.x_rotation)
          parts.push(`x_rotation=${this.rangeToString(filters.x_rotation)}`);
        if (filters.y_rotation)
          parts.push(`y_rotation=${this.rangeToString(filters.y_rotation)}`);
        return this.finalizeSelector(parts.length ? `${kind}[${parts.join(",")}]` : kind);
      }
      finalizeSelector(selector) {
        return normalizeSelector(selector, this.warnings);
      }
      rangeToString(r) {
        if (r.min !== void 0 && r.max !== void 0) {
          if (r.min === r.max)
            return `${r.min}`;
          return `${r.min}..${r.max}`;
        }
        if (r.min !== void 0)
          return `${r.min}..`;
        if (r.max !== void 0)
          return `..${r.max}`;
        return "..";
      }
    };
    exports2.Lowering = Lowering;
    var LoweringBuilder = class _LoweringBuilder {
      constructor() {
        this.labelCount = 0;
        this.blocks = [];
        this.currentBlock = null;
        this.locals = /* @__PURE__ */ new Set();
      }
      /** Reset the global temp counter (call between compilations). */
      static resetTempCounter() {
        _LoweringBuilder.globalTempId = 0;
      }
      freshTemp() {
        const name = `$_${_LoweringBuilder.globalTempId++}`;
        this.locals.add(name);
        return name;
      }
      freshLabel(hint = "L") {
        return `${hint}_${this.labelCount++}`;
      }
      startBlock(label) {
        this.currentBlock = { label, instrs: [], term: null };
      }
      isBlockSealed() {
        return this.currentBlock === null || this.currentBlock.term !== null;
      }
      sealBlock(term) {
        if (this.currentBlock) {
          this.currentBlock.term = term;
          this.blocks.push(this.currentBlock);
          this.currentBlock = null;
        }
      }
      emitAssign(dst, src) {
        if (!dst.startsWith("$") && !dst.startsWith("@")) {
          dst = "$" + dst;
        }
        this.locals.add(dst);
        this.currentBlock?.instrs.push({ op: "assign", dst, src });
      }
      emitBinop(dst, lhs, bop, rhs) {
        this.locals.add(dst);
        this.currentBlock?.instrs.push({ op: "binop", dst, lhs, bop, rhs });
      }
      emitCmp(dst, lhs, cop, rhs) {
        this.locals.add(dst);
        this.currentBlock?.instrs.push({ op: "cmp", dst, lhs, cop, rhs });
      }
      emitCall(fn, args, dst) {
        if (dst)
          this.locals.add(dst);
        this.currentBlock?.instrs.push({ op: "call", fn, args, dst });
      }
      emitRaw(cmd) {
        this.currentBlock?.instrs.push({ op: "raw", cmd });
      }
      emitJump(target) {
        this.sealBlock({ op: "jump", target });
      }
      emitJumpIf(cond, then, else_) {
        this.sealBlock({ op: "jump_if", cond, then, else_ });
      }
      emitReturn(value) {
        this.sealBlock({ op: "return", value });
      }
      build(name, params, isTickLoop = false) {
        if (this.currentBlock && !this.currentBlock.term) {
          this.sealBlock({ op: "return" });
        }
        return {
          name,
          params,
          locals: Array.from(this.locals),
          blocks: this.blocks,
          isTickLoop
        };
      }
    };
    LoweringBuilder.globalTempId = 0;
  }
});

// ../../dist/optimizer/commands.js
var require_commands = __commonJS({
  "../../dist/optimizer/commands.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createEmptyOptimizationStats = createEmptyOptimizationStats;
    exports2.mergeOptimizationStats = mergeOptimizationStats;
    exports2.applyLICM = applyLICM;
    exports2.applyCSE = applyCSE;
    exports2.batchSetblocks = batchSetblocks;
    exports2.optimizeCommandFunctions = optimizeCommandFunctions;
    var SCOREBOARD_READ_RE = /^execute store result score (\$[A-Za-z0-9_]+) rs run scoreboard players get (\S+) (\S+)$/;
    var SCOREBOARD_WRITE_RE = /^(?:scoreboard players (?:set|add|remove|reset)\s+(\S+)\s+(\S+)|scoreboard players operation\s+(\S+)\s+(\S+)\s+[+\-*/%]?= )/;
    var EXECUTE_STORE_SCORE_RE = /^execute store result score (\S+) (\S+) run /;
    var FUNCTION_CALL_RE = /^execute as (.+) run function ([^:]+):(.+)$/;
    var TEMP_RE = /\$[A-Za-z0-9_]+/g;
    var SETBLOCK_RE = /^setblock (-?\d+) (-?\d+) (-?\d+) (\S+)$/;
    function createEmptyOptimizationStats() {
      return {
        licmHoists: 0,
        licmLoopBodies: 0,
        cseRedundantReads: 0,
        cseArithmetic: 0,
        setblockMergedCommands: 0,
        setblockFillCommands: 0,
        setblockSavedCommands: 0,
        deadCodeRemoved: 0,
        constantFolds: 0,
        inlinedTrivialFunctions: 0,
        totalCommandsBefore: 0,
        totalCommandsAfter: 0
      };
    }
    function cloneCommand(command) {
      return { ...command };
    }
    function cloneFunctions(functions) {
      return functions.map((fn) => ({
        name: fn.name,
        commands: fn.commands.map(cloneCommand)
      }));
    }
    function mergeOptimizationStats(base, delta) {
      for (const [key, value] of Object.entries(delta)) {
        base[key] += value;
      }
    }
    function parseScoreboardWrite(command) {
      const executeStoreMatch = command.match(EXECUTE_STORE_SCORE_RE);
      if (executeStoreMatch) {
        return { player: executeStoreMatch[1], objective: executeStoreMatch[2] };
      }
      const match = command.match(SCOREBOARD_WRITE_RE);
      if (!match) {
        return null;
      }
      if (match[1] && match[2]) {
        return { player: match[1], objective: match[2] };
      }
      if (match[3] && match[4]) {
        return { player: match[3], objective: match[4] };
      }
      return null;
    }
    function collectObjectiveWrites(functions) {
      const writes = /* @__PURE__ */ new Map();
      for (const fn of functions) {
        for (const command of fn.commands) {
          const write = parseScoreboardWrite(command.cmd);
          if (!write)
            continue;
          writes.set(write.objective, (writes.get(write.objective) ?? 0) + 1);
        }
      }
      return writes;
    }
    function applyLICMInternal(functions) {
      const stats = { licmHoists: 0, licmLoopBodies: 0 };
      const functionMap = new Map(functions.map((fn) => [fn.name, fn]));
      const objectiveWrites = collectObjectiveWrites(functions);
      for (const fn of functions) {
        const nextCommands = [];
        for (const command of fn.commands) {
          const match = command.cmd.match(FUNCTION_CALL_RE);
          if (!match) {
            nextCommands.push(command);
            continue;
          }
          const loopFn = functionMap.get(match[3]);
          if (!loopFn) {
            nextCommands.push(command);
            continue;
          }
          const readInfo = /* @__PURE__ */ new Map();
          const scoreboardWrites = /* @__PURE__ */ new Set();
          for (const inner of loopFn.commands) {
            const readMatch = inner.cmd.match(SCOREBOARD_READ_RE);
            if (readMatch) {
              const [, temp, player, objective] = readMatch;
              const key = `${player} ${objective}`;
              readInfo.set(key, { temp, player, objective, uses: 0 });
            }
            const write = parseScoreboardWrite(inner.cmd);
            if (write) {
              scoreboardWrites.add(`${write.player} ${write.objective}`);
            }
          }
          for (const inner of loopFn.commands) {
            for (const info of readInfo.values()) {
              const matches = inner.cmd.match(TEMP_RE) ?? [];
              const usageCount = matches.filter((name) => name === info.temp).length;
              const isDef = inner.cmd.startsWith(`execute store result score ${info.temp} rs run scoreboard players get `);
              if (!isDef) {
                info.uses += usageCount;
              }
            }
          }
          const hoistable = Array.from(readInfo.entries()).filter(([key, info]) => {
            if (info.uses < 2)
              return false;
            if ((objectiveWrites.get(info.objective) ?? 0) !== 0)
              return false;
            if (scoreboardWrites.has(key))
              return false;
            return true;
          }).map(([, info]) => info);
          if (hoistable.length === 0) {
            nextCommands.push(command);
            continue;
          }
          const hoistedTemps = new Set(hoistable.map((item) => item.temp));
          const rewrittenLoopCommands = [];
          for (const inner of loopFn.commands) {
            const readMatch = inner.cmd.match(SCOREBOARD_READ_RE);
            if (readMatch && hoistedTemps.has(readMatch[1])) {
              continue;
            }
            rewrittenLoopCommands.push(inner);
          }
          loopFn.commands = rewrittenLoopCommands;
          nextCommands.push(...hoistable.map((item) => ({
            cmd: `execute store result score ${item.temp} rs run scoreboard players get ${item.player} ${item.objective}`
          })), command);
          stats.licmHoists = (stats.licmHoists ?? 0) + hoistable.length;
          stats.licmLoopBodies = (stats.licmLoopBodies ?? 0) + 1;
        }
        fn.commands = nextCommands;
      }
      return stats;
    }
    function extractArithmeticExpression(commands, index) {
      const assign = commands[index]?.cmd.match(/^scoreboard players operation (\$[A-Za-z0-9_]+) rs = (\$[A-Za-z0-9_]+|\$const_-?\d+) rs$/) ?? commands[index]?.cmd.match(/^scoreboard players set (\$[A-Za-z0-9_]+) rs (-?\d+)$/);
      const op = commands[index + 1]?.cmd.match(/^scoreboard players operation (\$[A-Za-z0-9_]+) rs ([+\-*/%]=) (\$[A-Za-z0-9_]+|\$const_-?\d+) rs$/);
      if (!assign || !op || assign[1] !== op[1]) {
        return null;
      }
      return {
        key: `${assign[2]} ${op[2]} ${op[3]}`,
        dst: assign[1]
      };
    }
    function applyCSEInternal(functions) {
      const stats = { cseRedundantReads: 0, cseArithmetic: 0 };
      for (const fn of functions) {
        let invalidateByTemp = function(temp) {
          for (const [key, value] of readCache.entries()) {
            if (value === temp || key.includes(`${temp} `) || key.endsWith(` ${temp}`)) {
              readCache.delete(key);
            }
          }
          for (const [key, value] of exprCache.entries()) {
            if (value === temp || key.includes(temp)) {
              exprCache.delete(key);
            }
          }
        };
        const commands = fn.commands.map(cloneCommand);
        const readCache = /* @__PURE__ */ new Map();
        const exprCache = /* @__PURE__ */ new Map();
        const rewritten = [];
        for (let i = 0; i < commands.length; i++) {
          const command = commands[i];
          const readMatch = command.cmd.match(SCOREBOARD_READ_RE);
          if (readMatch) {
            const [, dst, player, objective] = readMatch;
            const key = `${player} ${objective}`;
            const cached = readCache.get(key);
            if (cached) {
              stats.cseRedundantReads = (stats.cseRedundantReads ?? 0) + 1;
              rewritten.push({ ...command, cmd: `scoreboard players operation ${dst} rs = ${cached} rs` });
            } else {
              readCache.set(key, dst);
              rewritten.push(command);
            }
            invalidateByTemp(dst);
            readCache.set(key, dst);
            continue;
          }
          const expr = extractArithmeticExpression(commands, i);
          if (expr) {
            const cached = exprCache.get(expr.key);
            if (cached) {
              rewritten.push({ ...commands[i], cmd: `scoreboard players operation ${expr.dst} rs = ${cached} rs` });
              stats.cseArithmetic = (stats.cseArithmetic ?? 0) + 1;
              i += 1;
            } else {
              rewritten.push(command);
              rewritten.push(commands[i + 1]);
              exprCache.set(expr.key, expr.dst);
              i += 1;
            }
            invalidateByTemp(expr.dst);
            exprCache.set(expr.key, expr.dst);
            continue;
          }
          const write = parseScoreboardWrite(command.cmd);
          if (write) {
            readCache.delete(`${write.player} ${write.objective}`);
            if (write.player.startsWith("$")) {
              invalidateByTemp(write.player);
            }
          }
          rewritten.push(command);
        }
        fn.commands = rewritten;
      }
      return stats;
    }
    function batchSetblocksInCommands(commands) {
      const rewritten = [];
      const stats = {
        setblockMergedCommands: 0,
        setblockFillCommands: 0,
        setblockSavedCommands: 0
      };
      for (let i = 0; i < commands.length; ) {
        const start = commands[i].cmd.match(SETBLOCK_RE);
        if (!start) {
          rewritten.push(commands[i]);
          i++;
          continue;
        }
        const block = start[4];
        const run = [{ index: i, x: Number(start[1]), y: Number(start[2]), z: Number(start[3]) }];
        let axis = null;
        let j = i + 1;
        while (j < commands.length) {
          const next = commands[j].cmd.match(SETBLOCK_RE);
          if (!next || next[4] !== block)
            break;
          const point = { x: Number(next[1]), y: Number(next[2]), z: Number(next[3]) };
          const prev = run[run.length - 1];
          if (point.y !== prev.y)
            break;
          const stepX = point.x - prev.x;
          const stepZ = point.z - prev.z;
          if (axis === null) {
            if (stepX === 1 && stepZ === 0)
              axis = "x";
            else if (stepX === 0 && stepZ === 1)
              axis = "z";
            else
              break;
          }
          const valid = axis === "x" ? point.z === prev.z && stepX === 1 && stepZ === 0 : point.x === prev.x && stepX === 0 && stepZ === 1;
          if (!valid)
            break;
          run.push({ index: j, ...point });
          j++;
        }
        if (run.length >= 2) {
          const first = run[0];
          const last = run[run.length - 1];
          rewritten.push({
            ...commands[i],
            cmd: `fill ${first.x} ${first.y} ${first.z} ${last.x} ${last.y} ${last.z} ${block}`
          });
          stats.setblockMergedCommands = (stats.setblockMergedCommands ?? 0) + run.length;
          stats.setblockFillCommands = (stats.setblockFillCommands ?? 0) + 1;
          stats.setblockSavedCommands = (stats.setblockSavedCommands ?? 0) + (run.length - 1);
          i = j;
          continue;
        }
        rewritten.push(commands[i]);
        i++;
      }
      return { commands: rewritten, stats };
    }
    function applySetblockBatchingInternal(functions) {
      const stats = {
        setblockMergedCommands: 0,
        setblockFillCommands: 0,
        setblockSavedCommands: 0
      };
      for (const fn of functions) {
        const batched = batchSetblocksInCommands(fn.commands);
        fn.commands = batched.commands;
        mergeOptimizationStats(stats, batched.stats);
      }
      return stats;
    }
    function applyLICM(functions) {
      const optimized = cloneFunctions(functions);
      const stats = createEmptyOptimizationStats();
      stats.totalCommandsBefore = optimized.reduce((sum, fn) => sum + fn.commands.length, 0);
      mergeOptimizationStats(stats, applyLICMInternal(optimized));
      stats.totalCommandsAfter = optimized.reduce((sum, fn) => sum + fn.commands.length, 0);
      return { functions: optimized, stats };
    }
    function applyCSE(functions) {
      const optimized = cloneFunctions(functions);
      const stats = createEmptyOptimizationStats();
      stats.totalCommandsBefore = optimized.reduce((sum, fn) => sum + fn.commands.length, 0);
      mergeOptimizationStats(stats, applyCSEInternal(optimized));
      stats.totalCommandsAfter = optimized.reduce((sum, fn) => sum + fn.commands.length, 0);
      return { functions: optimized, stats };
    }
    function batchSetblocks(functions) {
      const optimized = cloneFunctions(functions);
      const stats = createEmptyOptimizationStats();
      stats.totalCommandsBefore = optimized.reduce((sum, fn) => sum + fn.commands.length, 0);
      mergeOptimizationStats(stats, applySetblockBatchingInternal(optimized));
      stats.totalCommandsAfter = optimized.reduce((sum, fn) => sum + fn.commands.length, 0);
      return { functions: optimized, stats };
    }
    function inlineTrivialFunctions(functions) {
      const FUNCTION_CMD_RE = /^function ([^:]+):(.+)$/;
      const trivialMap = /* @__PURE__ */ new Map();
      const emptyFunctions = /* @__PURE__ */ new Set();
      const SYSTEM_FUNCTIONS = /* @__PURE__ */ new Set(["__tick", "__load"]);
      for (const fn of functions) {
        if (SYSTEM_FUNCTIONS.has(fn.name) || fn.name.startsWith("__trigger_")) {
          continue;
        }
        const nonCommentCmds = fn.commands.filter((cmd) => !cmd.cmd.startsWith("#"));
        if (nonCommentCmds.length === 0 && fn.name.includes("/")) {
          emptyFunctions.add(fn.name);
        } else if (nonCommentCmds.length === 1 && fn.name.includes("/")) {
          const match = nonCommentCmds[0].cmd.match(FUNCTION_CMD_RE);
          if (match) {
            trivialMap.set(fn.name, match[2]);
          }
        }
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const [from, to] of trivialMap) {
          if (emptyFunctions.has(to)) {
            trivialMap.delete(from);
            emptyFunctions.add(from);
            changed = true;
          } else {
            const finalTarget = trivialMap.get(to);
            if (finalTarget && finalTarget !== to) {
              trivialMap.set(from, finalTarget);
              changed = true;
            }
          }
        }
      }
      const totalRemoved = trivialMap.size + emptyFunctions.size;
      if (totalRemoved === 0) {
        return { functions, stats: {} };
      }
      const removedNames = /* @__PURE__ */ new Set([...trivialMap.keys(), ...emptyFunctions]);
      const result = [];
      for (const fn of functions) {
        if (removedNames.has(fn.name)) {
          continue;
        }
        const rewrittenCmds = [];
        for (const cmd of fn.commands) {
          const emptyCallMatch = cmd.cmd.match(/^(?:execute .* run )?function ([^:]+):([^\s]+)$/);
          if (emptyCallMatch) {
            const targetFn = emptyCallMatch[2];
            if (emptyFunctions.has(targetFn)) {
              continue;
            }
          }
          const rewritten = cmd.cmd.replace(/function ([^:]+):([^\s]+)/g, (match, ns, fnPath) => {
            const target = trivialMap.get(fnPath);
            return target ? `function ${ns}:${target}` : match;
          });
          rewrittenCmds.push({ ...cmd, cmd: rewritten });
        }
        result.push({ name: fn.name, commands: rewrittenCmds });
      }
      return {
        functions: result,
        stats: { inlinedTrivialFunctions: totalRemoved }
      };
    }
    function optimizeCommandFunctions(functions) {
      const initial = cloneFunctions(functions);
      const stats = createEmptyOptimizationStats();
      stats.totalCommandsBefore = initial.reduce((sum, fn) => sum + fn.commands.length, 0);
      const inlined = inlineTrivialFunctions(initial);
      mergeOptimizationStats(stats, inlined.stats);
      const licm = applyLICM(inlined.functions);
      mergeOptimizationStats(stats, licm.stats);
      const cse = applyCSE(licm.functions);
      mergeOptimizationStats(stats, cse.stats);
      const batched = batchSetblocks(cse.functions);
      mergeOptimizationStats(stats, batched.stats);
      stats.totalCommandsAfter = batched.functions.reduce((sum, fn) => sum + fn.commands.length, 0);
      return {
        functions: batched.functions,
        stats
      };
    }
  }
});

// ../../dist/optimizer/passes.js
var require_passes = __commonJS({
  "../../dist/optimizer/passes.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.defaultPipeline = void 0;
    exports2.constantFolding = constantFolding;
    exports2.constantFoldingWithStats = constantFoldingWithStats;
    exports2.copyPropagation = copyPropagation;
    exports2.deadCodeElimination = deadCodeElimination;
    exports2.deadCodeEliminationWithStats = deadCodeEliminationWithStats;
    exports2.optimize = optimize;
    exports2.optimizeWithStats = optimizeWithStats;
    var commands_1 = require_commands();
    function isConst(op) {
      return op.kind === "const";
    }
    function evalBinop(lhs, bop, rhs) {
      switch (bop) {
        case "+":
          return lhs + rhs;
        case "-":
          return lhs - rhs;
        case "*":
          return lhs * rhs;
        case "/":
          return rhs === 0 ? null : Math.trunc(lhs / rhs);
        // MC uses truncated int division
        case "%":
          return rhs === 0 ? null : lhs % rhs;
        default:
          return null;
      }
    }
    function evalCmp(lhs, cop, rhs) {
      switch (cop) {
        case "==":
          return lhs === rhs ? 1 : 0;
        case "!=":
          return lhs !== rhs ? 1 : 0;
        case "<":
          return lhs < rhs ? 1 : 0;
        case "<=":
          return lhs <= rhs ? 1 : 0;
        case ">":
          return lhs > rhs ? 1 : 0;
        case ">=":
          return lhs >= rhs ? 1 : 0;
        default:
          return 0;
      }
    }
    function constantFolding(fn) {
      return constantFoldingWithStats(fn).fn;
    }
    function constantFoldingWithStats(fn) {
      let folded = 0;
      const newBlocks = fn.blocks.map((block) => {
        const newInstrs = [];
        for (const instr of block.instrs) {
          if (instr.op === "binop" && isConst(instr.lhs) && isConst(instr.rhs)) {
            const result = evalBinop(instr.lhs.value, instr.bop, instr.rhs.value);
            if (result !== null) {
              folded++;
              newInstrs.push({ op: "assign", dst: instr.dst, src: { kind: "const", value: result } });
              continue;
            }
          }
          if (instr.op === "cmp" && isConst(instr.lhs) && isConst(instr.rhs)) {
            const result = evalCmp(instr.lhs.value, instr.cop, instr.rhs.value);
            folded++;
            newInstrs.push({ op: "assign", dst: instr.dst, src: { kind: "const", value: result } });
            continue;
          }
          newInstrs.push(instr);
        }
        return { ...block, instrs: newInstrs };
      });
      return { fn: { ...fn, blocks: newBlocks }, stats: { constantFolds: folded } };
    }
    function copyPropagation(fn) {
      const newBlocks = fn.blocks.map((block) => {
        const copies = /* @__PURE__ */ new Map();
        function resolve(op) {
          if (op.kind !== "var")
            return op;
          return copies.get(op.name) ?? op;
        }
        const newInstrs = [];
        for (const instr of block.instrs) {
          switch (instr.op) {
            case "assign": {
              const src = resolve(instr.src);
              if (src.kind === "var" || src.kind === "const") {
                copies.set(instr.dst, src);
              } else {
                copies.delete(instr.dst);
              }
              newInstrs.push({ ...instr, src });
              break;
            }
            case "binop":
              copies.delete(instr.dst);
              newInstrs.push({ ...instr, lhs: resolve(instr.lhs), rhs: resolve(instr.rhs) });
              break;
            case "cmp":
              copies.delete(instr.dst);
              newInstrs.push({ ...instr, lhs: resolve(instr.lhs), rhs: resolve(instr.rhs) });
              break;
            case "call":
              if (instr.dst)
                copies.delete(instr.dst);
              newInstrs.push({ ...instr, args: instr.args.map(resolve) });
              break;
            default:
              newInstrs.push(instr);
          }
        }
        return { ...block, instrs: newInstrs };
      });
      return { ...fn, blocks: newBlocks };
    }
    function deadCodeElimination(fn) {
      return deadCodeEliminationWithStats(fn).fn;
    }
    function deadCodeEliminationWithStats(fn) {
      const readVars = /* @__PURE__ */ new Set();
      function markRead(op) {
        if (op.kind === "var")
          readVars.add(op.name);
      }
      function markRawReads(cmd) {
        for (const match of cmd.matchAll(/\$[A-Za-z0-9_]+/g)) {
          readVars.add(match[0]);
        }
      }
      for (const block of fn.blocks) {
        for (const instr of block.instrs) {
          if (instr.op === "binop") {
            markRead(instr.lhs);
            markRead(instr.rhs);
          }
          if (instr.op === "cmp") {
            markRead(instr.lhs);
            markRead(instr.rhs);
          }
          if (instr.op === "call") {
            instr.args.forEach(markRead);
          }
          if (instr.op === "assign") {
            markRead(instr.src);
          }
          if (instr.op === "raw") {
            markRawReads(instr.cmd);
          }
        }
        const t = block.term;
        if (t.op === "jump_if" || t.op === "jump_unless")
          readVars.add(t.cond);
        if (t.op === "return" && t.value)
          markRead(t.value);
        if (t.op === "tick_yield") {
        }
      }
      fn.params.forEach((p) => readVars.add(p));
      let removed = 0;
      const newBlocks = fn.blocks.map((block) => ({
        ...block,
        instrs: block.instrs.filter((instr) => {
          if (instr.op === "assign" || instr.op === "binop" || instr.op === "cmp") {
            const isTemp = /^\$t\d+$/.test(instr.dst) || /^\$p\d+$/.test(instr.dst) || /^\$_\d+$/.test(instr.dst);
            const keep = !isTemp || readVars.has(instr.dst);
            if (!keep)
              removed++;
            return keep;
          }
          return true;
        })
      }));
      return { fn: { ...fn, blocks: newBlocks }, stats: { deadCodeRemoved: removed } };
    }
    exports2.defaultPipeline = [
      { name: "constant-folding", run: constantFolding },
      { name: "copy-propagation", run: copyPropagation },
      { name: "dead-code-elimination", run: deadCodeElimination }
      // commandMerging is applied during codegen (MC-specific)
    ];
    function optimize(fn, passes = exports2.defaultPipeline) {
      return optimizeWithStats(fn, passes).fn;
    }
    function optimizeWithStats(fn, passes = exports2.defaultPipeline) {
      let current = fn;
      const stats = (0, commands_1.createEmptyOptimizationStats)();
      for (const pass of passes) {
        if (pass.name === "constant-folding") {
          const result = constantFoldingWithStats(current);
          current = result.fn;
          (0, commands_1.mergeOptimizationStats)(stats, result.stats);
          continue;
        }
        if (pass.name === "dead-code-elimination") {
          const result = deadCodeEliminationWithStats(current);
          current = result.fn;
          (0, commands_1.mergeOptimizationStats)(stats, result.stats);
          continue;
        }
        current = pass.run(current);
      }
      return { fn: current, stats };
    }
  }
});

// ../../dist/optimizer/dce.js
var require_dce = __commonJS({
  "../../dist/optimizer/dce.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DeadCodeEliminator = void 0;
    exports2.eliminateDeadCode = eliminateDeadCode;
    function copySpan(target, source) {
      const descriptor = Object.getOwnPropertyDescriptor(source, "span");
      if (descriptor) {
        Object.defineProperty(target, "span", descriptor);
      }
      return target;
    }
    function isConstantBoolean(expr) {
      if (expr.kind === "bool_lit") {
        return expr.value;
      }
      return null;
    }
    function isPureExpr(expr) {
      switch (expr.kind) {
        case "int_lit":
        case "float_lit":
        case "byte_lit":
        case "short_lit":
        case "long_lit":
        case "double_lit":
        case "rel_coord":
        case "local_coord":
        case "bool_lit":
        case "str_lit":
        case "mc_name":
        case "range_lit":
        case "selector":
        case "ident":
        case "blockpos":
          return true;
        case "str_interp":
          return expr.parts.every((part) => typeof part === "string" || isPureExpr(part));
        case "f_string":
          return expr.parts.every((part) => part.kind === "text" || isPureExpr(part.expr));
        case "binary":
          return isPureExpr(expr.left) && isPureExpr(expr.right);
        case "is_check":
          return isPureExpr(expr.expr);
        case "unary":
          return isPureExpr(expr.operand);
        case "member":
          return isPureExpr(expr.obj);
        case "index":
          return isPureExpr(expr.obj) && isPureExpr(expr.index);
        case "array_lit":
          return expr.elements.every(isPureExpr);
        case "struct_lit":
          return expr.fields.every((field) => isPureExpr(field.value));
        case "lambda":
          return true;
        case "assign":
        case "member_assign":
        case "call":
        case "invoke":
        case "static_call":
          return false;
      }
    }
    var DeadCodeEliminator = class {
      constructor() {
        this.functionMap = /* @__PURE__ */ new Map();
        this.reachableFunctions = /* @__PURE__ */ new Set();
        this.usedConstants = /* @__PURE__ */ new Set();
        this.localReads = /* @__PURE__ */ new Set();
        this.localDeclIds = /* @__PURE__ */ new WeakMap();
        this.localIdCounter = 0;
        this.warnings = [];
      }
      eliminate(program) {
        this.functionMap.clear();
        this.reachableFunctions.clear();
        this.usedConstants.clear();
        this.localReads.clear();
        this.localIdCounter = 0;
        this.warnings.length = 0;
        for (const fn of program.declarations) {
          this.functionMap.set(fn.name, fn);
        }
        const entryPoints = this.findEntryPoints(program);
        if (entryPoints.length === 0) {
          for (const fn of program.declarations) {
            this.markReachable(fn.name);
          }
        } else {
          for (const fnName of entryPoints) {
            this.markReachable(fnName);
          }
        }
        for (const global of program.globals) {
          this.collectExprRefs(global.init, []);
        }
        for (const implBlock of program.implBlocks) {
          for (const method of implBlock.methods) {
            this.collectFunctionRefs(method);
          }
        }
        return {
          ...program,
          declarations: program.declarations.filter((fn) => this.reachableFunctions.has(fn.name)).map((fn) => this.transformFunction(fn)),
          consts: program.consts.filter((constDecl) => this.usedConstants.has(constDecl.name)),
          implBlocks: program.implBlocks.map((implBlock) => ({
            ...implBlock,
            methods: implBlock.methods.map((method) => this.transformFunction(method))
          }))
        };
      }
      findEntryPoints(program) {
        const entries = /* @__PURE__ */ new Set();
        for (const fn of program.declarations) {
          if (!fn.name.startsWith("_")) {
            entries.add(fn.name);
          }
          if (fn.decorators.some((decorator) => [
            "tick",
            "load",
            "on",
            "on_trigger",
            "on_advancement",
            "on_craft",
            "on_death",
            "on_login",
            "on_join_team",
            "keep"
          ].includes(decorator.name))) {
            entries.add(fn.name);
          }
        }
        return [...entries];
      }
      markReachable(fnName) {
        if (this.reachableFunctions.has(fnName)) {
          return;
        }
        const fn = this.functionMap.get(fnName);
        if (!fn) {
          return;
        }
        this.reachableFunctions.add(fnName);
        this.collectFunctionRefs(fn);
      }
      collectFunctionRefs(fn) {
        const scope = [fn.params.map((param) => ({ id: `param:${fn.name}:${param.name}`, name: param.name }))];
        for (const param of fn.params) {
          if (param.default) {
            this.collectExprRefs(param.default, scope);
          }
        }
        this.collectStmtRefs(fn.body, scope);
      }
      collectStmtRefs(block, scope) {
        scope.push([]);
        for (const stmt of block) {
          this.collectStmtRef(stmt, scope);
        }
        scope.pop();
      }
      collectStmtRef(stmt, scope) {
        switch (stmt.kind) {
          case "let": {
            this.collectExprRefs(stmt.init, scope);
            const id = `local:${stmt.name}:${this.localIdCounter++}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`;
            this.localDeclIds.set(stmt, id);
            scope[scope.length - 1].push({ id, name: stmt.name });
            break;
          }
          case "expr":
            this.collectExprRefs(stmt.expr, scope);
            break;
          case "return":
            if (stmt.value) {
              this.collectExprRefs(stmt.value, scope);
            }
            break;
          case "if": {
            this.collectExprRefs(stmt.cond, scope);
            const constant = isConstantBoolean(stmt.cond);
            if (constant === true) {
              this.collectStmtRefs(stmt.then, scope);
            } else if (constant === false) {
              if (stmt.else_) {
                this.collectStmtRefs(stmt.else_, scope);
              }
            } else {
              this.collectStmtRefs(stmt.then, scope);
              if (stmt.else_) {
                this.collectStmtRefs(stmt.else_, scope);
              }
            }
            break;
          }
          case "while":
            this.collectExprRefs(stmt.cond, scope);
            this.collectStmtRefs(stmt.body, scope);
            break;
          case "for":
            scope.push([]);
            if (stmt.init) {
              this.collectStmtRef(stmt.init, scope);
            }
            this.collectExprRefs(stmt.cond, scope);
            this.collectExprRefs(stmt.step, scope);
            this.collectStmtRefs(stmt.body, scope);
            scope.pop();
            break;
          case "foreach":
            this.collectExprRefs(stmt.iterable, scope);
            scope.push([{ id: `foreach:${stmt.binding}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.binding }]);
            this.collectStmtRefs(stmt.body, scope);
            scope.pop();
            break;
          case "for_range":
            this.collectExprRefs(stmt.start, scope);
            this.collectExprRefs(stmt.end, scope);
            scope.push([{ id: `range:${stmt.varName}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.varName }]);
            this.collectStmtRefs(stmt.body, scope);
            scope.pop();
            break;
          case "match":
            this.collectExprRefs(stmt.expr, scope);
            for (const arm of stmt.arms) {
              if (arm.pattern) {
                this.collectExprRefs(arm.pattern, scope);
              }
              this.collectStmtRefs(arm.body, scope);
            }
            break;
          case "as_block":
          case "at_block":
          case "as_at":
          case "execute":
            this.collectNestedStmtRefs(stmt, scope);
            break;
          case "raw":
          case "break":
          case "continue":
            break;
        }
      }
      collectNestedStmtRefs(stmt, scope) {
        if (stmt.kind === "execute") {
          for (const sub of stmt.subcommands) {
            if ("varName" in sub && sub.varName) {
              const resolved = this.resolveLocal(sub.varName, scope);
              if (resolved) {
                this.localReads.add(resolved.id);
              }
            }
          }
        }
        this.collectStmtRefs(stmt.body, scope);
      }
      collectExprRefs(expr, scope) {
        switch (expr.kind) {
          case "ident": {
            const resolved = this.resolveLocal(expr.name, scope);
            if (resolved) {
              this.localReads.add(resolved.id);
            } else {
              this.usedConstants.add(expr.name);
            }
            break;
          }
          case "call":
            {
              const resolved = this.resolveLocal(expr.fn, scope);
              if (resolved) {
                this.localReads.add(resolved.id);
              } else if (this.functionMap.has(expr.fn)) {
                this.markReachable(expr.fn);
              }
            }
            for (const arg of expr.args) {
              this.collectExprRefs(arg, scope);
            }
            break;
          case "static_call":
            for (const arg of expr.args) {
              this.collectExprRefs(arg, scope);
            }
            break;
          case "invoke":
            this.collectExprRefs(expr.callee, scope);
            for (const arg of expr.args) {
              this.collectExprRefs(arg, scope);
            }
            break;
          case "member":
            this.collectExprRefs(expr.obj, scope);
            break;
          case "member_assign":
            this.collectExprRefs(expr.obj, scope);
            this.collectExprRefs(expr.value, scope);
            break;
          case "index":
            this.collectExprRefs(expr.obj, scope);
            this.collectExprRefs(expr.index, scope);
            break;
          case "array_lit":
            expr.elements.forEach((element) => this.collectExprRefs(element, scope));
            break;
          case "struct_lit":
            expr.fields.forEach((field) => this.collectExprRefs(field.value, scope));
            break;
          case "binary":
            this.collectExprRefs(expr.left, scope);
            this.collectExprRefs(expr.right, scope);
            break;
          case "is_check":
            this.collectExprRefs(expr.expr, scope);
            break;
          case "unary":
            this.collectExprRefs(expr.operand, scope);
            break;
          case "assign": {
            this.collectExprRefs(expr.value, scope);
            break;
          }
          case "str_interp":
            expr.parts.forEach((part) => {
              if (typeof part !== "string") {
                this.collectExprRefs(part, scope);
              }
            });
            break;
          case "f_string":
            expr.parts.forEach((part) => {
              if (part.kind === "expr") {
                this.collectExprRefs(part.expr, scope);
              }
            });
            break;
          case "lambda": {
            const lambdaScope = [
              ...scope.map((entries) => [...entries]),
              expr.params.map((param) => ({ id: `lambda:${param.name}:${expr.span?.line ?? 0}:${expr.span?.col ?? 0}`, name: param.name }))
            ];
            if (Array.isArray(expr.body)) {
              this.collectStmtRefs(expr.body, lambdaScope);
            } else {
              this.collectExprRefs(expr.body, lambdaScope);
            }
            break;
          }
          case "blockpos":
          case "bool_lit":
          case "byte_lit":
          case "double_lit":
          case "float_lit":
          case "int_lit":
          case "long_lit":
          case "mc_name":
          case "range_lit":
          case "selector":
          case "short_lit":
          case "str_lit":
            break;
        }
      }
      resolveLocal(name, scope) {
        for (let i = scope.length - 1; i >= 0; i--) {
          for (let j = scope[i].length - 1; j >= 0; j--) {
            if (scope[i][j].name === name) {
              return scope[i][j];
            }
          }
        }
        return null;
      }
      transformFunction(fn) {
        const scope = [fn.params.map((param) => ({ id: `param:${fn.name}:${param.name}`, name: param.name }))];
        const body = this.transformBlock(fn.body, scope);
        return body === fn.body ? fn : copySpan({ ...fn, body }, fn);
      }
      transformBlock(block, scope) {
        scope.push([]);
        const transformed = [];
        for (const stmt of block) {
          const next = this.transformStmt(stmt, scope);
          transformed.push(...next);
        }
        scope.pop();
        return transformed;
      }
      transformStmt(stmt, scope) {
        switch (stmt.kind) {
          case "let": {
            const init = this.transformExpr(stmt.init, scope);
            const id = this.localDeclIds.get(stmt) ?? `local:${stmt.name}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`;
            scope[scope.length - 1].push({ id, name: stmt.name });
            if (this.localReads.has(id)) {
              if (init === stmt.init) {
                return [stmt];
              }
              return [copySpan({ ...stmt, init }, stmt)];
            }
            this.warnings.push({
              message: `Unused variable '${stmt.name}'`,
              code: "W_UNUSED_VAR",
              line: stmt.span?.line,
              col: stmt.span?.col
            });
            if (isPureExpr(init)) {
              return [];
            }
            return [copySpan({ kind: "expr", expr: init }, stmt)];
          }
          case "expr": {
            const expr = this.transformExpr(stmt.expr, scope);
            if (expr.kind === "assign") {
              const resolved = this.resolveLocal(expr.target, scope);
              if (resolved && !this.localReads.has(resolved.id)) {
                if (isPureExpr(expr.value)) {
                  return [];
                }
                return [copySpan({ kind: "expr", expr: expr.value }, stmt)];
              }
            }
            if (expr === stmt.expr) {
              return [stmt];
            }
            return [copySpan({ ...stmt, expr }, stmt)];
          }
          case "return": {
            if (!stmt.value) {
              return [stmt];
            }
            const value = this.transformExpr(stmt.value, scope);
            if (value === stmt.value) {
              return [stmt];
            }
            return [copySpan({ ...stmt, value }, stmt)];
          }
          case "if": {
            const cond = this.transformExpr(stmt.cond, scope);
            const constant = isConstantBoolean(cond);
            if (constant === true) {
              return this.transformBlock(stmt.then, scope);
            }
            if (constant === false) {
              return stmt.else_ ? this.transformBlock(stmt.else_, scope) : [];
            }
            const thenBlock = this.transformBlock(stmt.then, scope);
            const elseBlock = stmt.else_ ? this.transformBlock(stmt.else_, scope) : void 0;
            if (cond === stmt.cond && thenBlock === stmt.then && elseBlock === stmt.else_) {
              return [stmt];
            }
            return [copySpan({ ...stmt, cond, then: thenBlock, else_: elseBlock }, stmt)];
          }
          case "while": {
            const cond = this.transformExpr(stmt.cond, scope);
            if (isConstantBoolean(cond) === false) {
              return [];
            }
            const body = this.transformBlock(stmt.body, scope);
            return [copySpan({ ...stmt, cond, body }, stmt)];
          }
          case "for": {
            const forScope = [...scope, []];
            const init = stmt.init ? this.transformStmt(stmt.init, forScope)[0] : void 0;
            const cond = this.transformExpr(stmt.cond, forScope);
            if (isConstantBoolean(cond) === false) {
              return init ? [init] : [];
            }
            const step = this.transformExpr(stmt.step, forScope);
            const body = this.transformBlock(stmt.body, forScope);
            return [copySpan({ ...stmt, init, cond, step, body }, stmt)];
          }
          case "foreach": {
            const iterable = this.transformExpr(stmt.iterable, scope);
            const foreachScope = [...scope, [{ id: `foreach:${stmt.binding}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.binding }]];
            const body = this.transformBlock(stmt.body, foreachScope);
            return [copySpan({ ...stmt, iterable, body }, stmt)];
          }
          case "for_range": {
            const start = this.transformExpr(stmt.start, scope);
            const end = this.transformExpr(stmt.end, scope);
            const rangeScope = [...scope, [{ id: `range:${stmt.varName}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.varName }]];
            const body = this.transformBlock(stmt.body, rangeScope);
            return [copySpan({ ...stmt, start, end, body }, stmt)];
          }
          case "match": {
            const expr = this.transformExpr(stmt.expr, scope);
            const arms = stmt.arms.map((arm) => ({
              pattern: arm.pattern ? this.transformExpr(arm.pattern, scope) : null,
              body: this.transformBlock(arm.body, scope)
            }));
            return [copySpan({ ...stmt, expr, arms }, stmt)];
          }
          case "as_block":
            return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)];
          case "at_block":
            return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)];
          case "as_at":
            return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)];
          case "execute":
            return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)];
          case "raw":
            return [stmt];
          case "break":
            return [stmt];
          case "continue":
            return [stmt];
        }
      }
      transformExpr(expr, scope) {
        switch (expr.kind) {
          case "call":
            return copySpan({ ...expr, args: expr.args.map((arg) => this.transformExpr(arg, scope)) }, expr);
          case "static_call":
            return copySpan({ ...expr, args: expr.args.map((arg) => this.transformExpr(arg, scope)) }, expr);
          case "invoke":
            return copySpan({
              ...expr,
              callee: this.transformExpr(expr.callee, scope),
              args: expr.args.map((arg) => this.transformExpr(arg, scope))
            }, expr);
          case "binary":
            return copySpan({
              ...expr,
              left: this.transformExpr(expr.left, scope),
              right: this.transformExpr(expr.right, scope)
            }, expr);
          case "is_check":
            return copySpan({ ...expr, expr: this.transformExpr(expr.expr, scope) }, expr);
          case "unary":
            return copySpan({ ...expr, operand: this.transformExpr(expr.operand, scope) }, expr);
          case "assign":
            return copySpan({ ...expr, value: this.transformExpr(expr.value, scope) }, expr);
          case "member":
            return copySpan({ ...expr, obj: this.transformExpr(expr.obj, scope) }, expr);
          case "member_assign":
            return copySpan({
              ...expr,
              obj: this.transformExpr(expr.obj, scope),
              value: this.transformExpr(expr.value, scope)
            }, expr);
          case "index":
            return copySpan({
              ...expr,
              obj: this.transformExpr(expr.obj, scope),
              index: this.transformExpr(expr.index, scope)
            }, expr);
          case "array_lit":
            return copySpan({ ...expr, elements: expr.elements.map((element) => this.transformExpr(element, scope)) }, expr);
          case "struct_lit":
            return copySpan({
              ...expr,
              fields: expr.fields.map((field) => ({ ...field, value: this.transformExpr(field.value, scope) }))
            }, expr);
          case "str_interp":
            return copySpan({
              ...expr,
              parts: expr.parts.map((part) => typeof part === "string" ? part : this.transformExpr(part, scope))
            }, expr);
          case "f_string":
            return copySpan({
              ...expr,
              parts: expr.parts.map((part) => part.kind === "text" ? part : { kind: "expr", expr: this.transformExpr(part.expr, scope) })
            }, expr);
          case "lambda": {
            const lambdaScope = [
              ...scope.map((entries) => [...entries]),
              expr.params.map((param) => ({ id: `lambda:${param.name}:${expr.span?.line ?? 0}:${expr.span?.col ?? 0}`, name: param.name }))
            ];
            const body = Array.isArray(expr.body) ? this.transformBlock(expr.body, lambdaScope) : this.transformExpr(expr.body, lambdaScope);
            return copySpan({ ...expr, body }, expr);
          }
          case "blockpos":
          case "bool_lit":
          case "byte_lit":
          case "double_lit":
          case "float_lit":
          case "ident":
          case "int_lit":
          case "long_lit":
          case "mc_name":
          case "range_lit":
          case "rel_coord":
          case "local_coord":
          case "selector":
          case "short_lit":
          case "str_lit":
            return expr;
        }
      }
    };
    exports2.DeadCodeEliminator = DeadCodeEliminator;
    function eliminateDeadCode(program) {
      const eliminator = new DeadCodeEliminator();
      const result = eliminator.eliminate(program);
      return { program: result, warnings: eliminator.warnings };
    }
  }
});

// ../../dist/codegen/mcfunction/index.js
var require_mcfunction = __commonJS({
  "../../dist/codegen/mcfunction/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.countMcfunctionCommands = countMcfunctionCommands;
    exports2.generateDatapackWithStats = generateDatapackWithStats;
    exports2.generateDatapack = generateDatapack;
    var commands_1 = require_commands();
    var types_1 = require_types();
    var OBJ = "rs";
    function varRef(name) {
      return name.startsWith("$") ? name : `$${name}`;
    }
    function operandToScore(op) {
      if (op.kind === "var")
        return `${varRef(op.name)} ${OBJ}`;
      if (op.kind === "const")
        return `$const_${op.value} ${OBJ}`;
      throw new Error(`Cannot convert storage operand to score: ${op.path}`);
    }
    function constSetup(value) {
      return `scoreboard players set $const_${value} ${OBJ} ${value}`;
    }
    function collectConsts(fn) {
      const consts = /* @__PURE__ */ new Set();
      for (const block of fn.blocks) {
        for (const instr of block.instrs) {
          if (instr.op === "assign" && instr.src.kind === "const")
            consts.add(instr.src.value);
          if (instr.op === "binop") {
            if (instr.lhs.kind === "const")
              consts.add(instr.lhs.value);
            if (instr.rhs.kind === "const")
              consts.add(instr.rhs.value);
          }
          if (instr.op === "cmp") {
            if (instr.lhs.kind === "const")
              consts.add(instr.lhs.value);
            if (instr.rhs.kind === "const")
              consts.add(instr.rhs.value);
          }
        }
        const t = block.term;
        if (t.op === "return" && t.value?.kind === "const")
          consts.add(t.value.value);
      }
      return consts;
    }
    var BOP_OP = {
      "+": "+=",
      "-": "-=",
      "*": "*=",
      "/": "/=",
      "%": "%="
    };
    function emitInstr(instr, ns) {
      const lines = [];
      switch (instr.op) {
        case "assign": {
          const dst = varRef(instr.dst);
          const src = instr.src;
          if (src.kind === "const") {
            lines.push(`scoreboard players set ${dst} ${OBJ} ${src.value}`);
          } else if (src.kind === "var") {
            lines.push(`scoreboard players operation ${dst} ${OBJ} = ${varRef(src.name)} ${OBJ}`);
          } else {
            lines.push(`execute store result score ${dst} ${OBJ} run data get storage ${src.path}`);
          }
          break;
        }
        case "binop": {
          const dst = varRef(instr.dst);
          const bop = BOP_OP[instr.bop] ?? "+=";
          lines.push(...emitInstr({ op: "assign", dst: instr.dst, src: instr.lhs }, ns));
          lines.push(`scoreboard players operation ${dst} ${OBJ} ${bop} ${operandToScore(instr.rhs)}`);
          break;
        }
        case "cmp": {
          const dst = varRef(instr.dst);
          const lhsScore = operandToScore(instr.lhs);
          const rhsScore = operandToScore(instr.rhs);
          lines.push(`scoreboard players set ${dst} ${OBJ} 0`);
          switch (instr.cop) {
            case "==":
              lines.push(`execute if score ${lhsScore} = ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`);
              break;
            case "!=":
              lines.push(`execute unless score ${lhsScore} = ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`);
              break;
            case "<":
              lines.push(`execute if score ${lhsScore} < ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`);
              break;
            case "<=":
              lines.push(`execute if score ${lhsScore} <= ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`);
              break;
            case ">":
              lines.push(`execute if score ${lhsScore} > ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`);
              break;
            case ">=":
              lines.push(`execute if score ${lhsScore} >= ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`);
              break;
          }
          break;
        }
        case "call": {
          for (let i = 0; i < instr.args.length; i++) {
            lines.push(...emitInstr({ op: "assign", dst: `$p${i}`, src: instr.args[i] }, ns));
          }
          lines.push(`function ${ns}:${instr.fn}`);
          if (instr.dst) {
            lines.push(`scoreboard players operation ${varRef(instr.dst)} ${OBJ} = $ret ${OBJ}`);
          }
          break;
        }
        case "raw":
          lines.push(instr.cmd);
          break;
      }
      return lines;
    }
    function emitTerm(term, ns, fnName) {
      const lines = [];
      switch (term.op) {
        case "jump":
          lines.push(`function ${ns}:${fnName}/${term.target}`);
          break;
        case "jump_if":
          lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.then}`);
          lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.else_}`);
          break;
        case "jump_unless":
          lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.then}`);
          lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.else_}`);
          break;
        case "return":
          if (term.value) {
            lines.push(...emitInstr({ op: "assign", dst: "$ret", src: term.value }, ns));
          }
          if (term.value?.kind === "const") {
            lines.push(`return ${term.value.value}`);
          } else if (term.value?.kind === "var") {
            lines.push(`return run scoreboard players get ${varRef(term.value.name)} ${OBJ}`);
          }
          break;
        case "tick_yield":
          lines.push(`schedule function ${ns}:${fnName}/${term.continuation} 1t replace`);
          break;
      }
      return lines;
    }
    function toFunctionName(file) {
      const match = file.path.match(/^data\/[^/]+\/function\/(.+)\.mcfunction$/);
      return match?.[1] ?? null;
    }
    function applyFunctionOptimization(files) {
      const functionFiles = files.map((file) => {
        const functionName = toFunctionName(file);
        if (!functionName)
          return null;
        const commands = file.content.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).map((cmd) => ({ cmd }));
        return { file, functionName, commands };
      }).filter((entry) => entry !== null);
      const optimized = (0, commands_1.optimizeCommandFunctions)(functionFiles.map((entry) => ({
        name: entry.functionName,
        commands: entry.commands
      })));
      const commandMap = new Map(optimized.functions.map((fn) => [fn.name, fn.commands]));
      const optimizedNames = new Set(optimized.functions.map((fn) => fn.name));
      return {
        files: files.filter((file) => {
          const functionName = toFunctionName(file);
          return !functionName || optimizedNames.has(functionName);
        }).map((file) => {
          const functionName = toFunctionName(file);
          if (!functionName)
            return file;
          const commands = commandMap.get(functionName);
          if (!commands)
            return file;
          const lines = file.content.split("\n");
          const header = lines.filter((line) => line.trim().startsWith("#"));
          return {
            ...file,
            content: [...header, ...commands.map((command) => command.cmd)].join("\n")
          };
        }),
        stats: optimized.stats
      };
    }
    function countMcfunctionCommands(files) {
      return files.reduce((sum, file) => {
        if (!toFunctionName(file)) {
          return sum;
        }
        return sum + file.content.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).length;
      }, 0);
    }
    function generateDatapackWithStats(module3, options = {}) {
      const { optimizeCommands = true } = options;
      const files = [];
      const advancements = [];
      const ns = module3.namespace;
      const triggerHandlers = module3.functions.filter((fn) => fn.isTriggerHandler && fn.triggerName);
      const triggerNames = new Set(triggerHandlers.map((fn) => fn.triggerName));
      const eventHandlers = module3.functions.filter((fn) => !!fn.eventHandler && (0, types_1.isEventTypeName)(fn.eventHandler.eventType));
      const eventTypes = new Set(eventHandlers.map((fn) => fn.eventHandler.eventType));
      const tickFunctionNames = [];
      for (const fn of module3.functions) {
        if (fn.isTickLoop) {
          tickFunctionNames.push(fn.name);
        }
      }
      files.push({
        path: "pack.mcmeta",
        content: JSON.stringify({
          pack: { pack_format: 26, description: `${ns} datapack \u2014 compiled by redscript` }
        }, null, 2)
      });
      const loadLines = [
        `# RedScript runtime init`,
        `scoreboard objectives add ${OBJ} dummy`
      ];
      for (const g of module3.globals) {
        loadLines.push(`scoreboard players set ${varRef(g.name)} ${OBJ} ${g.init}`);
      }
      for (const triggerName of triggerNames) {
        loadLines.push(`scoreboard objectives add ${triggerName} trigger`);
        loadLines.push(`scoreboard players enable @a ${triggerName}`);
      }
      for (const eventType of eventTypes) {
        const detection = types_1.EVENT_TYPES[eventType].detection;
        if (eventType === "PlayerDeath") {
          loadLines.push("scoreboard objectives add rs.deaths deathCount");
        } else if (eventType === "EntityKill") {
          loadLines.push("scoreboard objectives add rs.kills totalKillCount");
        } else if (eventType === "ItemUse") {
          loadLines.push("# ItemUse detection requires a project-specific objective/tag setup");
        } else if (detection === "tag" || detection === "advancement") {
          loadLines.push(`# ${eventType} detection expects tag ${types_1.EVENT_TYPES[eventType].tag} to be set externally`);
        }
      }
      for (const triggerName of triggerNames) {
        const handlers = triggerHandlers.filter((fn) => fn.triggerName === triggerName);
        const dispatchLines = [
          `# Trigger dispatch for ${triggerName}`
        ];
        for (const handler of handlers) {
          dispatchLines.push(`function ${ns}:${handler.name}`);
        }
        dispatchLines.push(`scoreboard players set @s ${triggerName} 0`);
        dispatchLines.push(`scoreboard players enable @s ${triggerName}`);
        files.push({
          path: `data/${ns}/function/__trigger_${triggerName}_dispatch.mcfunction`,
          content: dispatchLines.join("\n")
        });
      }
      for (const fn of module3.functions) {
        const consts = collectConsts(fn);
        if (consts.size > 0) {
          loadLines.push(...Array.from(consts).map(constSetup));
        }
        for (let i = 0; i < fn.blocks.length; i++) {
          const block = fn.blocks[i];
          const lines = [`# block: ${block.label}`];
          if (i === 0) {
            for (let j = 0; j < fn.params.length; j++) {
              lines.push(`scoreboard players operation ${varRef(fn.params[j])} ${OBJ} = $p${j} ${OBJ}`);
            }
          }
          for (const instr of block.instrs) {
            lines.push(...emitInstr(instr, ns));
          }
          lines.push(...emitTerm(block.term, ns, fn.name));
          const filePath = i === 0 ? `data/${ns}/function/${fn.name}.mcfunction` : `data/${ns}/function/${fn.name}/${block.label}.mcfunction`;
          files.push({ path: filePath, content: lines.join("\n") });
        }
      }
      for (const fn of module3.functions) {
        if (fn.isLoadInit) {
          loadLines.push(`function ${ns}:${fn.name}`);
        }
      }
      files.push({
        path: `data/${ns}/function/__load.mcfunction`,
        content: loadLines.join("\n")
      });
      files.push({
        path: `data/minecraft/tags/function/load.json`,
        content: JSON.stringify({ values: [`${ns}:__load`] }, null, 2)
      });
      const tickLines = ["# RedScript tick dispatcher"];
      for (const fnName of tickFunctionNames) {
        tickLines.push(`function ${ns}:${fnName}`);
      }
      if (triggerNames.size > 0) {
        tickLines.push(`# Trigger checks`);
        for (const triggerName of triggerNames) {
          tickLines.push(`execute as @a[scores={${triggerName}=1..}] run function ${ns}:__trigger_${triggerName}_dispatch`);
        }
      }
      if (eventHandlers.length > 0) {
        tickLines.push("# Event checks");
        for (const eventType of eventTypes) {
          const tag = types_1.EVENT_TYPES[eventType].tag;
          const handlers = eventHandlers.filter((fn) => fn.eventHandler?.eventType === eventType);
          for (const handler of handlers) {
            tickLines.push(`execute as @a[tag=${tag}] run function ${ns}:${handler.name}`);
          }
          tickLines.push(`tag @a[tag=${tag}] remove ${tag}`);
        }
      }
      if (tickFunctionNames.length > 0 || triggerNames.size > 0 || eventHandlers.length > 0) {
        files.push({
          path: `data/${ns}/function/__tick.mcfunction`,
          content: tickLines.join("\n")
        });
        files.push({
          path: `data/minecraft/tags/function/tick.json`,
          content: JSON.stringify({ values: [`${ns}:__tick`] }, null, 2)
        });
      }
      for (const fn of module3.functions) {
        const eventTrigger = fn.eventTrigger;
        if (!eventTrigger) {
          continue;
        }
        let path2 = "";
        let criteria = {};
        switch (eventTrigger.kind) {
          case "advancement":
            path2 = `data/${ns}/advancements/on_advancement_${fn.name}.json`;
            criteria = {
              trigger: {
                trigger: `minecraft:${eventTrigger.value}`
              }
            };
            break;
          case "craft":
            path2 = `data/${ns}/advancements/on_craft_${fn.name}.json`;
            criteria = {
              crafted: {
                trigger: "minecraft:inventory_changed",
                conditions: {
                  items: [
                    {
                      items: [eventTrigger.value]
                    }
                  ]
                }
              }
            };
            break;
          case "death":
            path2 = `data/${ns}/advancements/on_death_${fn.name}.json`;
            criteria = {
              death: {
                trigger: "minecraft:entity_killed_player"
              }
            };
            break;
          case "login":
          case "join_team":
            continue;
        }
        advancements.push({
          path: path2,
          content: JSON.stringify({
            criteria,
            rewards: {
              function: `${ns}:${fn.name}`
            }
          }, null, 2)
        });
      }
      const stats = (0, commands_1.createEmptyOptimizationStats)();
      if (!optimizeCommands) {
        return { files, advancements, stats };
      }
      const optimized = applyFunctionOptimization(files);
      (0, commands_1.mergeOptimizationStats)(stats, optimized.stats);
      return { files: optimized.files, advancements, stats };
    }
    function generateDatapack(module3) {
      const generated = generateDatapackWithStats(module3);
      return [...generated.files, ...generated.advancements];
    }
  }
});

// ../../dist/compile.js
var require_compile = __commonJS({
  "../../dist/compile.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.preprocessSourceWithMetadata = preprocessSourceWithMetadata;
    exports2.preprocessSource = preprocessSource;
    exports2.compile = compile;
    exports2.formatCompileError = formatCompileError;
    var fs2 = __importStar(require("fs"));
    var path2 = __importStar(require("path"));
    var lexer_1 = require_lexer();
    var parser_1 = require_parser();
    var lowering_1 = require_lowering();
    var passes_1 = require_passes();
    var dce_1 = require_dce();
    var mcfunction_1 = require_mcfunction();
    var diagnostics_1 = require_diagnostics();
    var IMPORT_RE = /^\s*import\s+"([^"]+)"\s*;?\s*$/;
    function countLines(source) {
      return source === "" ? 0 : source.split("\n").length;
    }
    function offsetRanges(ranges, lineOffset) {
      return ranges.map((range) => ({
        startLine: range.startLine + lineOffset,
        endLine: range.endLine + lineOffset,
        filePath: range.filePath
      }));
    }
    function preprocessSourceWithMetadata(source, options = {}) {
      const { filePath } = options;
      const seen = options.seen ?? /* @__PURE__ */ new Set();
      if (filePath) {
        seen.add(path2.resolve(filePath));
      }
      const lines = source.split("\n");
      const imports = [];
      const bodyLines = [];
      let parsingHeader = true;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const match = line.match(IMPORT_RE);
        if (parsingHeader && match) {
          if (!filePath) {
            throw new diagnostics_1.DiagnosticError("ParseError", "Import statements require a file path", { line: i + 1, col: 1 }, lines);
          }
          const importPath = path2.resolve(path2.dirname(filePath), match[1]);
          if (!seen.has(importPath)) {
            seen.add(importPath);
            let importedSource;
            try {
              importedSource = fs2.readFileSync(importPath, "utf-8");
            } catch {
              throw new diagnostics_1.DiagnosticError("ParseError", `Cannot import '${match[1]}'`, { file: filePath, line: i + 1, col: 1 }, lines);
            }
            imports.push(preprocessSourceWithMetadata(importedSource, { filePath: importPath, seen }));
          }
          continue;
        }
        if (parsingHeader && (trimmed === "" || trimmed.startsWith("//"))) {
          bodyLines.push(line);
          continue;
        }
        parsingHeader = false;
        bodyLines.push(line);
      }
      const body = bodyLines.join("\n");
      const parts = [...imports.map((entry) => entry.source), body].filter(Boolean);
      const combined = parts.join("\n");
      const ranges = [];
      let lineOffset = 0;
      for (const entry of imports) {
        ranges.push(...offsetRanges(entry.ranges, lineOffset));
        lineOffset += countLines(entry.source);
      }
      if (filePath && body) {
        ranges.push({
          startLine: lineOffset + 1,
          endLine: lineOffset + countLines(body),
          filePath: path2.resolve(filePath)
        });
      }
      return { source: combined, ranges };
    }
    function preprocessSource(source, options = {}) {
      return preprocessSourceWithMetadata(source, options).source;
    }
    function compile(source, options = {}) {
      const { namespace = "redscript", filePath, optimize: shouldOptimize = true } = options;
      const shouldRunDce = options.dce ?? shouldOptimize;
      let sourceLines = source.split("\n");
      try {
        const preprocessed = preprocessSourceWithMetadata(source, { filePath });
        const preprocessedSource = preprocessed.source;
        sourceLines = preprocessedSource.split("\n");
        const tokens = new lexer_1.Lexer(preprocessedSource, filePath).tokenize();
        const parsedAst = new parser_1.Parser(tokens, preprocessedSource, filePath).parse(namespace);
        const dceResult = shouldRunDce ? (0, dce_1.eliminateDeadCode)(parsedAst) : { program: parsedAst, warnings: [] };
        const ast = dceResult.program;
        const ir = new lowering_1.Lowering(namespace, preprocessed.ranges).lower(ast);
        const optimized = shouldOptimize ? { ...ir, functions: ir.functions.map((fn) => (0, passes_1.optimize)(fn)) } : ir;
        const generated = (0, mcfunction_1.generateDatapackWithStats)(optimized);
        return {
          success: true,
          files: [...generated.files, ...generated.advancements],
          advancements: generated.advancements,
          ast,
          ir: optimized
        };
      } catch (err) {
        if (err instanceof diagnostics_1.DiagnosticError) {
          return { success: false, error: err };
        }
        if (err instanceof Error) {
          const diagnostic = (0, diagnostics_1.parseErrorMessage)("ParseError", err.message, sourceLines, filePath);
          return { success: false, error: diagnostic };
        }
        return {
          success: false,
          error: new diagnostics_1.DiagnosticError("ParseError", String(err), { file: filePath, line: 1, col: 1 }, sourceLines)
        };
      }
    }
    function formatCompileError(result) {
      if (result.success) {
        return "Compilation successful";
      }
      if (result.error) {
        return (0, diagnostics_1.formatError)(result.error, result.error.sourceLines?.join("\n"));
      }
      return "Unknown error";
    }
  }
});

// ../../dist/mc-validator/index.js
var require_mc_validator = __commonJS({
  "../../dist/mc-validator/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MCCommandValidator = void 0;
    var fs2 = __importStar(require("fs"));
    var FUNCTION_ID_RE = /^[0-9a-z_.-]+:[0-9a-z_./-]+$/i;
    var INTEGER_RE = /^-?\d+$/;
    var SCORE_RANGE_RE = /^-?\d+\.\.$|^\.\.-?\d+$|^-?\d+\.\.-?\d+$|^-?\d+$/;
    var COMMENT_PREFIXES = [
      "# RedScript runtime init",
      "# block:",
      "# RedScript tick dispatcher"
    ];
    var SCOREBOARD_PLAYER_ACTIONS = /* @__PURE__ */ new Set(["set", "add", "remove", "get", "operation", "enable"]);
    var SCOREBOARD_OPERATIONS = /* @__PURE__ */ new Set(["=", "+=", "-=", "*=", "/=", "%=", "<", ">", "><"]);
    var MCCommandValidator = class {
      constructor(commandsPath) {
        const parsed = JSON.parse(fs2.readFileSync(commandsPath, "utf-8"));
        this.root = parsed.root;
        this.rootChildren = parsed.root.children ?? [];
      }
      validate(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
          return { valid: true };
        }
        const tokens = tokenize(trimmed);
        if (tokens.length === 0) {
          return { valid: true };
        }
        if (!this.hasRootCommand(tokens[0])) {
          return { valid: false, error: `Unknown root command: ${tokens[0]}` };
        }
        switch (tokens[0]) {
          case "execute":
            return this.validateExecute(tokens);
          case "scoreboard":
            return this.validateScoreboard(tokens);
          case "function":
            return this.validateFunction(tokens);
          case "data":
            return this.validateData(tokens);
          case "return":
            return this.validateReturn(tokens);
          default:
            return this.validateAgainstTree(tokens);
        }
      }
      hasRootCommand(command) {
        return this.rootChildren.some((child) => child.type === "literal" && child.name === command);
      }
      validateExecute(tokens) {
        const runIndex = tokens.indexOf("run");
        if (runIndex === 1 || runIndex === tokens.length - 1) {
          return { valid: false, error: "Malformed execute run clause" };
        }
        if (runIndex !== -1) {
          const chainResult = this.validateAgainstTree(tokens.slice(0, runIndex));
          if (!chainResult.valid) {
            return chainResult;
          }
          return this.validate(tokens.slice(runIndex + 1).join(" "));
        }
        return this.validateAgainstTree(tokens);
      }
      validateScoreboard(tokens) {
        if (tokens[1] === "objectives" && tokens[2] === "add") {
          if (tokens.length < 5) {
            return { valid: false, error: "scoreboard objectives add requires name and criteria" };
          }
          return this.validateAgainstTree(tokens);
        }
        if (tokens[1] !== "players" || !SCOREBOARD_PLAYER_ACTIONS.has(tokens[2] ?? "")) {
          return this.validateAgainstTree(tokens);
        }
        const action = tokens[2];
        if (action === "enable") {
          if (tokens.length !== 5) {
            return { valid: false, error: "scoreboard players enable requires target and objective" };
          }
          return this.validateAgainstTree(tokens);
        }
        if (action === "get") {
          if (tokens.length !== 5) {
            return { valid: false, error: "scoreboard players get requires target and objective" };
          }
          return this.validateAgainstTree(tokens);
        }
        if (action === "operation") {
          if (tokens.length !== 8) {
            return { valid: false, error: "scoreboard players operation requires 5 operands" };
          }
          if (!SCOREBOARD_OPERATIONS.has(tokens[5])) {
            return { valid: false, error: `Unknown scoreboard operation: ${tokens[5]}` };
          }
          return this.validateAgainstTree(tokens);
        }
        if (tokens.length !== 6) {
          return { valid: false, error: `scoreboard players ${action} requires target, objective, and value` };
        }
        if (!INTEGER_RE.test(tokens[5])) {
          return { valid: false, error: `Expected integer value, got: ${tokens[5]}` };
        }
        return this.validateAgainstTree(tokens);
      }
      validateFunction(tokens) {
        if (tokens.length !== 2 || !FUNCTION_ID_RE.test(tokens[1])) {
          return { valid: false, error: "function requires a namespaced function id" };
        }
        return this.validateAgainstTree(tokens);
      }
      validateData(tokens) {
        if (tokens.length < 5) {
          return { valid: false, error: "data command is incomplete" };
        }
        const action = tokens[1];
        if (!["get", "modify", "merge", "remove"].includes(action)) {
          return this.validateAgainstTree(tokens);
        }
        const targetType = tokens[2];
        if (!["storage", "entity", "block"].includes(targetType)) {
          return { valid: false, error: `Unsupported data target: ${targetType}` };
        }
        if (action === "get") {
          if (tokens.length < 5) {
            return { valid: false, error: "data get requires target and path" };
          }
          if (tokens[5] && !isNumberish(tokens[5])) {
            return { valid: false, error: `Invalid data get scale: ${tokens[5]}` };
          }
          return this.validateAgainstTree(tokens);
        }
        if (action === "modify") {
          if (tokens.length < 7) {
            return { valid: false, error: "data modify is incomplete" };
          }
          if (!["set", "append", "prepend", "insert", "merge"].includes(tokens[5])) {
            return { valid: false, error: `Unsupported data modify mode: ${tokens[5]}` };
          }
          return this.validateAgainstTree(tokens);
        }
        return this.validateAgainstTree(tokens);
      }
      validateReturn(tokens) {
        if (tokens.length < 2) {
          return { valid: false, error: "return requires a value or run clause" };
        }
        if (tokens[1] === "run") {
          if (tokens.length < 3) {
            return { valid: false, error: "return run requires an inner command" };
          }
          return this.validate(tokens.slice(2).join(" "));
        }
        if (!INTEGER_RE.test(tokens[1])) {
          return { valid: false, error: `Invalid return value: ${tokens[1]}` };
        }
        return this.validateAgainstTree(tokens);
      }
      validateAgainstTree(tokens) {
        const memo = /* @__PURE__ */ new Map();
        const isValid = walk(this.root, tokens, 0, memo, this.rootChildren);
        return isValid ? { valid: true } : { valid: false, error: `Command does not match Brigadier tree: ${tokens.join(" ")}` };
      }
    };
    exports2.MCCommandValidator = MCCommandValidator;
    function walk(node, tokens, index, memo, rootChildren) {
      const key = `${node.name ?? "<root>"}:${index}`;
      const cached = memo.get(key);
      if (cached !== void 0) {
        return cached;
      }
      if (index === tokens.length) {
        const done = node.executable === true || (node.children ?? []).length === 0;
        memo.set(key, done);
        return done;
      }
      const children = node.children ?? [];
      for (const child of children) {
        if (child.type === "literal") {
          if (child.name === tokens[index] && walk(child, tokens, index + 1, memo, rootChildren)) {
            memo.set(key, true);
            return true;
          }
          continue;
        }
        if (child.type !== "argument") {
          continue;
        }
        const parser = child.parser?.parser;
        const modifier = child.parser?.modifier?.type;
        if (parserConsumesRest(parser, modifier)) {
          const done = child.executable === true || (child.children ?? []).length === 0;
          if (done) {
            memo.set(key, true);
            return true;
          }
        }
        const width = parserTokenWidth(parser, tokens, index);
        if (width === null) {
          continue;
        }
        const nextIndex = index + width;
        if (walk(child, tokens, nextIndex, memo, rootChildren)) {
          memo.set(key, true);
          return true;
        }
        for (const redirect of child.redirects ?? []) {
          const target = rootChildren.find((candidate) => candidate.name === redirect);
          if (target && walk(target, tokens, nextIndex, memo, rootChildren)) {
            memo.set(key, true);
            return true;
          }
        }
      }
      memo.set(key, false);
      return false;
    }
    function parserConsumesRest(parser, modifier) {
      return parser === "brigadier:string" && modifier === "greedy" || parser === "minecraft:message";
    }
    function parserTokenWidth(parser, tokens, index) {
      switch (parser) {
        case "minecraft:vec3":
        case "minecraft:block_pos":
          return index + 3 <= tokens.length ? 3 : null;
        case "minecraft:vec2":
        case "minecraft:column_pos":
        case "minecraft:rotation":
          return index + 2 <= tokens.length ? 2 : null;
        default:
          return index < tokens.length ? 1 : null;
      }
    }
    function tokenize(line) {
      const tokens = [];
      let current = "";
      let quote = null;
      let escape = false;
      let bracketDepth = 0;
      let braceDepth = 0;
      for (const char of line) {
        if (escape) {
          current += char;
          escape = false;
          continue;
        }
        if (quote) {
          current += char;
          if (char === "\\") {
            escape = true;
          } else if (char === quote) {
            quote = null;
          }
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          current += char;
          continue;
        }
        if (char === "[")
          bracketDepth += 1;
        if (char === "]")
          bracketDepth = Math.max(0, bracketDepth - 1);
        if (char === "{")
          braceDepth += 1;
        if (char === "}")
          braceDepth = Math.max(0, braceDepth - 1);
        if (/\s/.test(char) && bracketDepth === 0 && braceDepth === 0) {
          if (current) {
            tokens.push(current);
            current = "";
          }
          continue;
        }
        current += char;
      }
      if (current) {
        tokens.push(current);
      }
      return tokens;
    }
    function isNumberish(value) {
      return /^-?\d+(\.\d+)?$/.test(value) || SCORE_RANGE_RE.test(value);
    }
  }
});

// ../../dist/index.js
var require_dist = __commonJS({
  "../../dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MCCommandValidator = exports2.generateDatapack = exports2.optimize = exports2.Lowering = exports2.TypeChecker = exports2.Parser = exports2.Lexer = exports2.version = void 0;
    exports2.compile = compile;
    exports2.check = check;
    exports2.version = "1.2.11";
    var lexer_1 = require_lexer();
    var parser_1 = require_parser();
    var typechecker_1 = require_typechecker();
    var lowering_1 = require_lowering();
    var passes_1 = require_passes();
    var dce_1 = require_dce();
    var mcfunction_1 = require_mcfunction();
    var compile_1 = require_compile();
    var commands_1 = require_commands();
    function compile(source, options = {}) {
      const namespace = options.namespace ?? "redscript";
      const shouldOptimize = options.optimize ?? true;
      const shouldTypeCheck = options.typeCheck ?? true;
      const shouldRunDce = options.dce ?? shouldOptimize;
      const filePath = options.filePath;
      const preprocessed = (0, compile_1.preprocessSourceWithMetadata)(source, { filePath });
      const preprocessedSource = preprocessed.source;
      const tokens = new lexer_1.Lexer(preprocessedSource, filePath).tokenize();
      const parsedAst = new parser_1.Parser(tokens, preprocessedSource, filePath).parse(namespace);
      const dceResult = shouldRunDce ? (0, dce_1.eliminateDeadCode)(parsedAst) : { program: parsedAst, warnings: [] };
      const ast = dceResult.program;
      let typeErrors;
      if (shouldTypeCheck) {
        const checker = new typechecker_1.TypeChecker(preprocessedSource, filePath);
        typeErrors = checker.check(ast);
      }
      const lowering = new lowering_1.Lowering(namespace, preprocessed.ranges);
      const ir = lowering.lower(ast);
      let optimizedIR = ir;
      let generated = (0, mcfunction_1.generateDatapackWithStats)(ir, { optimizeCommands: shouldOptimize });
      let optimizationStats;
      if (shouldOptimize) {
        const stats = (0, commands_1.createEmptyOptimizationStats)();
        const copyPropagatedFunctions = [];
        const deadCodeEliminatedFunctions = [];
        for (const fn of ir.functions) {
          const folded = (0, passes_1.constantFoldingWithStats)(fn);
          stats.constantFolds += folded.stats.constantFolds ?? 0;
          const propagated = (0, passes_1.copyPropagation)(folded.fn);
          copyPropagatedFunctions.push(propagated);
          const dce = (0, passes_1.deadCodeEliminationWithStats)(propagated);
          deadCodeEliminatedFunctions.push(dce.fn);
        }
        const copyPropagatedIR = { ...ir, functions: copyPropagatedFunctions };
        optimizedIR = { ...ir, functions: deadCodeEliminatedFunctions };
        const baselineGenerated = (0, mcfunction_1.generateDatapackWithStats)(ir, { optimizeCommands: false });
        const beforeDceGenerated = (0, mcfunction_1.generateDatapackWithStats)(copyPropagatedIR, { optimizeCommands: false });
        const afterDceGenerated = (0, mcfunction_1.generateDatapackWithStats)(optimizedIR, { optimizeCommands: false });
        generated = (0, mcfunction_1.generateDatapackWithStats)(optimizedIR, { optimizeCommands: true });
        stats.deadCodeRemoved = (0, mcfunction_1.countMcfunctionCommands)(beforeDceGenerated.files) - (0, mcfunction_1.countMcfunctionCommands)(afterDceGenerated.files);
        stats.licmHoists = generated.stats.licmHoists;
        stats.licmLoopBodies = generated.stats.licmLoopBodies;
        stats.cseRedundantReads = generated.stats.cseRedundantReads;
        stats.cseArithmetic = generated.stats.cseArithmetic;
        stats.setblockMergedCommands = generated.stats.setblockMergedCommands;
        stats.setblockFillCommands = generated.stats.setblockFillCommands;
        stats.setblockSavedCommands = generated.stats.setblockSavedCommands;
        stats.totalCommandsBefore = (0, mcfunction_1.countMcfunctionCommands)(baselineGenerated.files);
        stats.totalCommandsAfter = (0, mcfunction_1.countMcfunctionCommands)(generated.files);
        optimizationStats = stats;
      } else {
        optimizedIR = ir;
        generated = (0, mcfunction_1.generateDatapackWithStats)(ir, { optimizeCommands: false });
      }
      return {
        files: [...generated.files, ...generated.advancements],
        advancements: generated.advancements,
        ast,
        ir: optimizedIR,
        typeErrors,
        warnings: [...dceResult.warnings, ...lowering.warnings],
        stats: optimizationStats
      };
    }
    function check(source, namespace = "redscript", filePath) {
      try {
        const preprocessedSource = (0, compile_1.preprocessSource)(source, { filePath });
        const tokens = new lexer_1.Lexer(preprocessedSource, filePath).tokenize();
        new parser_1.Parser(tokens, preprocessedSource, filePath).parse(namespace);
        return null;
      } catch (err) {
        return err;
      }
    }
    var lexer_2 = require_lexer();
    Object.defineProperty(exports2, "Lexer", { enumerable: true, get: function() {
      return lexer_2.Lexer;
    } });
    var parser_2 = require_parser();
    Object.defineProperty(exports2, "Parser", { enumerable: true, get: function() {
      return parser_2.Parser;
    } });
    var typechecker_2 = require_typechecker();
    Object.defineProperty(exports2, "TypeChecker", { enumerable: true, get: function() {
      return typechecker_2.TypeChecker;
    } });
    var lowering_2 = require_lowering();
    Object.defineProperty(exports2, "Lowering", { enumerable: true, get: function() {
      return lowering_2.Lowering;
    } });
    var passes_2 = require_passes();
    Object.defineProperty(exports2, "optimize", { enumerable: true, get: function() {
      return passes_2.optimize;
    } });
    var mcfunction_2 = require_mcfunction();
    Object.defineProperty(exports2, "generateDatapack", { enumerable: true, get: function() {
      return mcfunction_2.generateDatapack;
    } });
    var mc_validator_1 = require_mc_validator();
    Object.defineProperty(exports2, "MCCommandValidator", { enumerable: true, get: function() {
      return mc_validator_1.MCCommandValidator;
    } });
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode5 = __toESM(require("vscode"));

// src/hover.ts
var vscode = __toESM(require("vscode"));
var BUILTINS = {
  // --- Chat & Display ---
  say: {
    signature: "say(msg: string)",
    description: "Broadcast a message to all players as the server.",
    params: [{ name: "msg", type: "string", desc: "Message to broadcast" }],
    example: 'say("Hello world!");',
    mc: "say <msg>"
  },
  tell: {
    signature: "tell(target: selector, msg: string)",
    description: "Send a private message to a player or selector.",
    params: [
      { name: "target", type: "selector", desc: "Target player(s)" },
      { name: "msg", type: "string", desc: "Message to send" }
    ],
    example: 'tell(@s, "You scored a point!");',
    mc: 'tellraw <target> {"text":"<msg>"}'
  },
  announce: {
    signature: "announce(msg: string)",
    description: "Send a message to all players in chat.",
    params: [{ name: "msg", type: "string", desc: "Message text" }],
    example: 'announce("Game over!");',
    mc: 'tellraw @a {"text":"<msg>"}'
  },
  title: {
    signature: "title(target: selector, msg: string)",
    description: "Show a large title on screen for target players.",
    params: [
      { name: "target", type: "selector", desc: "Target player(s)" },
      { name: "msg", type: "string", desc: "Title text" }
    ],
    example: 'title(@a, "Round 1");',
    mc: 'title <target> title {"text":"<msg>"}'
  },
  subtitle: {
    signature: "subtitle(target: selector, msg: string)",
    description: "Show subtitle text below the title.",
    params: [
      { name: "target", type: "selector", desc: "Target player(s)" },
      { name: "msg", type: "string", desc: "Subtitle text" }
    ],
    example: 'subtitle(@a, "Fight!");',
    mc: 'title <target> subtitle {"text":"<msg>"}'
  },
  actionbar: {
    signature: "actionbar(target: selector, msg: string)",
    description: "Show text in the action bar (above hotbar).",
    params: [
      { name: "target", type: "selector", desc: "Target player(s)" },
      { name: "msg", type: "string", desc: "Action bar text" }
    ],
    example: 'actionbar(@a, "\u23F1 ${time}s remaining");',
    mc: 'title <target> actionbar {"text":"<msg>"}'
  },
  title_times: {
    signature: "title_times(target: selector, fadeIn: int, stay: int, fadeOut: int)",
    description: "Set title display timing (in ticks).",
    params: [
      { name: "target", type: "selector", desc: "Target player(s)" },
      { name: "fadeIn", type: "int", desc: "Fade-in ticks" },
      { name: "stay", type: "int", desc: "Stay ticks" },
      { name: "fadeOut", type: "int", desc: "Fade-out ticks" }
    ],
    example: "title_times(@a, 10, 40, 10);",
    mc: "title <target> times <fadeIn> <stay> <fadeOut>"
  },
  // --- Player ---
  give: {
    signature: "give(target: selector, item: string, count?: int)",
    description: "Give item(s) to a player.",
    params: [
      { name: "target", type: "selector", desc: "Target player(s)" },
      { name: "item", type: "string", desc: 'Item ID (e.g. "minecraft:diamond")' },
      { name: "count", type: "int", optional: true, desc: "Amount (default: 1)" }
    ],
    example: 'give(@s, "minecraft:diamond", 5);',
    mc: "give <target> <item> [count]"
  },
  kill: {
    signature: "kill(target?: selector)",
    description: "Kill entity/entities. Defaults to @s.",
    params: [{ name: "target", type: "selector", optional: true, desc: "Target (default: @s)" }],
    example: "kill(@e[type=minecraft:zombie]);",
    mc: "kill [target]"
  },
  effect: {
    signature: "effect(target: selector, effect: string, duration?: int, amplifier?: int)",
    description: "Apply a status effect.",
    params: [
      { name: "target", type: "selector", desc: "Target entity/player" },
      { name: "effect", type: "string", desc: 'Effect ID (e.g. "minecraft:speed")' },
      { name: "duration", type: "int", optional: true, desc: "Seconds (default: 30)" },
      { name: "amplifier", type: "int", optional: true, desc: "Level 0-255 (default: 0)" }
    ],
    example: 'effect(@s, "minecraft:speed", 60, 1);',
    mc: "effect give <target> <effect> [duration] [amplifier]"
  },
  clear: {
    signature: "clear(target: selector, item?: string)",
    description: "Remove items from inventory.",
    params: [
      { name: "target", type: "selector", desc: "Target player" },
      { name: "item", type: "string", optional: true, desc: "Specific item to remove (default: all)" }
    ],
    example: 'clear(@s, "minecraft:dirt");',
    mc: "clear <target> [item]"
  },
  kick: {
    signature: "kick(player: selector, reason?: string)",
    description: "Kick a player from the server.",
    params: [
      { name: "player", type: "selector", desc: "Target player" },
      { name: "reason", type: "string", optional: true, desc: "Kick message" }
    ],
    example: 'kick(@s, "You lost!");',
    mc: "kick <player> [reason]"
  },
  xp_add: {
    signature: "xp_add(target: selector, amount: int, type?: string)",
    description: "Add experience to a player.",
    params: [
      { name: "target", type: "selector", desc: "Target player" },
      { name: "amount", type: "int", desc: "Amount to add" },
      { name: "type", type: "string", optional: true, desc: '"points" or "levels" (default: "points")' }
    ],
    example: "xp_add(@s, 100);",
    mc: "xp add <target> <amount> [type]"
  },
  xp_set: {
    signature: "xp_set(target: selector, amount: int, type?: string)",
    description: "Set a player's experience.",
    params: [
      { name: "target", type: "selector", desc: "Target player" },
      { name: "amount", type: "int", desc: "New value" },
      { name: "type", type: "string", optional: true, desc: '"points" or "levels"' }
    ],
    example: 'xp_set(@s, 0, "levels");',
    mc: "xp set <target> <amount> [type]"
  },
  // --- Teleport ---
  tp: {
    signature: "tp(target: selector, destination: selector | BlockPos)",
    description: "Teleport entity to a player or coordinates.",
    params: [
      { name: "target", type: "selector", desc: "Entity to teleport" },
      { name: "destination", type: "selector | BlockPos", desc: "Target player or position" }
    ],
    example: "tp(@s, (0, 64, 0));\ntp(@a, @s);",
    mc: "tp <target> <dest>"
  },
  // --- World ---
  setblock: {
    signature: "setblock(pos: BlockPos, block: string)",
    description: "Place a block at coordinates.",
    params: [
      { name: "pos", type: "BlockPos", desc: "Target position e.g. (0, 64, 0) or (~1, ~0, ~0)" },
      { name: "block", type: "string", desc: 'Block ID (e.g. "minecraft:stone")' }
    ],
    example: 'setblock((0, 64, 0), "minecraft:stone");',
    mc: "setblock <x> <y> <z> <block>"
  },
  fill: {
    signature: "fill(from: BlockPos, to: BlockPos, block: string)",
    description: "Fill a region with blocks.",
    params: [
      { name: "from", type: "BlockPos", desc: "Start corner" },
      { name: "to", type: "BlockPos", desc: "End corner" },
      { name: "block", type: "string", desc: "Block to fill with" }
    ],
    example: 'fill((0, 64, 0), (10, 64, 10), "minecraft:grass_block");',
    mc: "fill <x1> <y1> <z1> <x2> <y2> <z2> <block>"
  },
  clone: {
    signature: "clone(from: BlockPos, to: BlockPos, dest: BlockPos)",
    description: "Clone a region of blocks to a new location.",
    params: [
      { name: "from", type: "BlockPos", desc: "Source start corner" },
      { name: "to", type: "BlockPos", desc: "Source end corner" },
      { name: "dest", type: "BlockPos", desc: "Destination corner" }
    ],
    example: "clone((0,64,0), (10,64,10), (20,64,0));",
    mc: "clone <x1> <y1> <z1> <x2> <y2> <z2> <dx> <dy> <dz>"
  },
  summon: {
    signature: "summon(type: string, pos: BlockPos)",
    description: "Spawn an entity at a location.",
    params: [
      { name: "type", type: "string", desc: 'Entity type ID (e.g. "minecraft:zombie")' },
      { name: "pos", type: "BlockPos", desc: "Spawn position" }
    ],
    example: 'summon("minecraft:zombie", (0, 64, 0));',
    mc: "summon <type> <x> <y> <z>"
  },
  weather: {
    signature: "weather(type: string)",
    description: "Set the weather.",
    params: [{ name: "type", type: "string", desc: '"clear", "rain", or "thunder"' }],
    example: 'weather("clear");',
    mc: "weather <type>"
  },
  time_set: {
    signature: "time_set(value: int | string)",
    description: "Set the world time.",
    params: [{ name: "value", type: "int | string", desc: 'Time in ticks, or "day"/"night"/"noon"/"midnight"' }],
    example: 'time_set(0);  // dawn\ntime_set("noon");',
    mc: "time set <value>"
  },
  time_add: {
    signature: "time_add(ticks: int)",
    description: "Advance world time by ticks.",
    params: [{ name: "ticks", type: "int", desc: "Ticks to add" }],
    example: "time_add(6000);",
    mc: "time add <ticks>"
  },
  gamerule: {
    signature: "gamerule(rule: string, value: bool | int)",
    description: "Set a gamerule value.",
    params: [
      { name: "rule", type: "string", desc: 'Gamerule name (e.g. "keepInventory")' },
      { name: "value", type: "bool | int", desc: "New value" }
    ],
    example: 'gamerule("keepInventory", true);\ngamerule("randomTickSpeed", 3);',
    mc: "gamerule <rule> <value>"
  },
  difficulty: {
    signature: "difficulty(level: string)",
    description: "Set the game difficulty.",
    params: [{ name: "level", type: "string", desc: '"peaceful", "easy", "normal", or "hard"' }],
    example: 'difficulty("hard");',
    mc: "difficulty <level>"
  },
  particle: {
    signature: "particle(name: string, pos: BlockPos)",
    description: "Spawn a particle effect.",
    params: [
      { name: "name", type: "string", desc: 'Particle type (e.g. "minecraft:flame")' },
      { name: "pos", type: "BlockPos", desc: "Position" }
    ],
    example: 'particle("minecraft:flame", (~0, ~1, ~0));',
    mc: "particle <name> <x> <y> <z>"
  },
  playsound: {
    signature: "playsound(sound: string, source: string, target: selector, pos?: BlockPos, volume?: float, pitch?: float)",
    description: "Play a sound for a player.",
    params: [
      { name: "sound", type: "string", desc: "Sound event ID" },
      { name: "source", type: "string", desc: 'Category: "master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice"' },
      { name: "target", type: "selector", desc: "Target player" },
      { name: "pos", type: "BlockPos", optional: true, desc: "Origin position" },
      { name: "volume", type: "float", optional: true, desc: "Volume (default: 1.0)" },
      { name: "pitch", type: "float", optional: true, desc: "Pitch (default: 1.0)" }
    ],
    example: 'playsound("entity.experience_orb.pickup", "player", @s);',
    mc: "playsound <sound> <source> <target>"
  },
  // --- Tags ---
  tag_add: {
    signature: "tag_add(target: selector, tag: string)",
    description: "Add an entity tag.",
    params: [
      { name: "target", type: "selector", desc: "Target entity" },
      { name: "tag", type: "string", desc: "Tag name" }
    ],
    example: 'tag_add(@s, "hasKey");',
    mc: "tag <target> add <tag>"
  },
  tag_remove: {
    signature: "tag_remove(target: selector, tag: string)",
    description: "Remove an entity tag.",
    params: [
      { name: "target", type: "selector", desc: "Target entity" },
      { name: "tag", type: "string", desc: "Tag name" }
    ],
    example: 'tag_remove(@s, "hasKey");',
    mc: "tag <target> remove <tag>"
  },
  // --- Scoreboard ---
  scoreboard_get: {
    signature: "scoreboard_get(target: selector | string, objective: string) -> int",
    description: "Read a scoreboard value.",
    params: [
      { name: "target", type: "selector | string", desc: 'Player/entity or fake player name (e.g. "#counter")' },
      { name: "objective", type: "string", desc: "Scoreboard objective name" }
    ],
    returns: "int",
    example: 'let hp: int = scoreboard_get(@s, "health");',
    mc: "scoreboard players get <target> <objective>"
  },
  score: {
    signature: "score(target: selector | string, objective: string) -> int",
    description: "Alias for scoreboard_get. Read a scoreboard value.",
    params: [
      { name: "target", type: "selector | string", desc: "Player/entity or fake player name" },
      { name: "objective", type: "string", desc: "Scoreboard objective name" }
    ],
    returns: "int",
    example: 'let kills: int = score(@s, "kills");',
    mc: "scoreboard players get <target> <objective>"
  },
  scoreboard_set: {
    signature: "scoreboard_set(target: selector | string, objective: string, value: int)",
    description: "Set a scoreboard value.",
    params: [
      { name: "target", type: "selector | string", desc: "Player/entity or fake player" },
      { name: "objective", type: "string", desc: "Objective name" },
      { name: "value", type: "int", desc: "New value" }
    ],
    example: 'scoreboard_set("#game", "timer", 300);',
    mc: "scoreboard players set <target> <objective> <value>"
  },
  scoreboard_add: {
    signature: "scoreboard_add(target: selector | string, objective: string, amount: int)",
    description: "Add to a scoreboard value.",
    params: [
      { name: "target", type: "selector | string", desc: "Player/entity or fake player" },
      { name: "objective", type: "string", desc: "Objective name" },
      { name: "amount", type: "int", desc: "Amount to add (can be negative)" }
    ],
    example: 'scoreboard_add(@s, "kills", 1);',
    mc: "scoreboard players add <target> <objective> <amount>"
  },
  scoreboard_display: {
    signature: "scoreboard_display(slot: string, objective: string)",
    description: "Display a scoreboard objective in a slot.",
    params: [
      { name: "slot", type: "string", desc: '"list", "sidebar", or "belowName"' },
      { name: "objective", type: "string", desc: "Objective name" }
    ],
    example: 'scoreboard_display("sidebar", "kills");',
    mc: "scoreboard objectives setdisplay <slot> <objective>"
  },
  scoreboard_add_objective: {
    signature: "scoreboard_add_objective(name: string, criteria: string)",
    description: "Create a new scoreboard objective.",
    params: [
      { name: "name", type: "string", desc: "Objective name" },
      { name: "criteria", type: "string", desc: 'Criteria (e.g. "dummy", "playerKillCount")' }
    ],
    example: 'scoreboard_add_objective("kills", "playerKillCount");',
    mc: "scoreboard objectives add <name> <criteria>"
  },
  scoreboard_remove_objective: {
    signature: "scoreboard_remove_objective(name: string)",
    description: "Remove a scoreboard objective.",
    params: [{ name: "name", type: "string", desc: "Objective name" }],
    example: 'scoreboard_remove_objective("kills");',
    mc: "scoreboard objectives remove <name>"
  },
  scoreboard_hide: {
    signature: "scoreboard_hide(slot: string)",
    description: "Clear the display in a scoreboard slot.",
    params: [{ name: "slot", type: "string", desc: '"list", "sidebar", or "belowName"' }],
    example: 'scoreboard_hide("sidebar");',
    mc: "scoreboard objectives setdisplay <slot>"
  },
  // --- Random ---
  random: {
    signature: "random(min: int, max: int) -> int",
    description: "Generate a random integer in range [min, max] using scoreboard arithmetic.",
    params: [
      { name: "min", type: "int", desc: "Minimum value (inclusive)" },
      { name: "max", type: "int", desc: "Maximum value (inclusive)" }
    ],
    returns: "int",
    example: "let roll: int = random(1, 6);"
  },
  random_native: {
    signature: "random_native(min: int, max: int) -> int",
    description: "Generate a random integer using /random command (MC 1.20.3+). Faster than random().",
    params: [
      { name: "min", type: "int", desc: "Minimum value (inclusive)" },
      { name: "max", type: "int", desc: "Maximum value (inclusive)" }
    ],
    returns: "int",
    example: "let n: int = random_native(1, 100);",
    mc: "random value <min> <max>"
  },
  // --- Strings ---
  str_len: {
    signature: "str_len(s: string) -> int",
    description: "Get the length of a string (stored in NBT storage).",
    params: [{ name: "s", type: "string", desc: "Input string" }],
    returns: "int",
    example: 'let n: int = str_len("hello");  // 5'
  },
  // --- Arrays ---
  push: {
    signature: "push(arr: T[], value: T)",
    description: "Append a value to the end of an array.",
    params: [
      { name: "arr", type: "T[]", desc: "Target array" },
      { name: "value", type: "T", desc: "Value to append" }
    ],
    example: "let scores: int[] = [];\npush(scores, 42);",
    mc: "data modify storage rs:heap <arr> append value <value>"
  },
  pop: {
    signature: "pop(arr: T[]) -> T",
    description: "Remove and return the last element of an array.",
    params: [{ name: "arr", type: "T[]", desc: "Target array" }],
    returns: "T",
    example: "let last: int = pop(scores);",
    mc: "data remove storage rs:heap <arr>[-1]"
  },
  len: {
    signature: "arr.len",
    description: "Get the number of elements in an array (property access, not a function call).",
    example: "let n: int = scores.len;"
  },
  // --- Data ---
  data_get: {
    signature: "data_get(target: string, path: string) -> int",
    description: "Read NBT data from entity/block/storage.",
    params: [
      { name: "target", type: "string", desc: "Target selector or storage path" },
      { name: "path", type: "string", desc: 'NBT path (e.g. "Health")' }
    ],
    returns: "int",
    example: 'let hp: int = data_get("@s", "Health");',
    mc: "execute store result score $rs_tmp rs_tmp run data get entity <target> <path>"
  },
  // --- Bossbar ---
  bossbar_add: {
    signature: "bossbar_add(id: string, name: string)",
    description: "Create a new boss bar.",
    params: [
      { name: "id", type: "string", desc: 'Boss bar ID (e.g. "minecraft:health")' },
      { name: "name", type: "string", desc: "Display name" }
    ],
    example: 'bossbar_add("mymod:timer", "Time Left");',
    mc: 'bossbar add <id> {"text":"<name>"}'
  },
  bossbar_set_value: {
    signature: "bossbar_set_value(id: string, value: int)",
    description: "Set boss bar current value.",
    params: [
      { name: "id", type: "string", desc: "Boss bar ID" },
      { name: "value", type: "int", desc: "Current value" }
    ],
    example: 'bossbar_set_value("mymod:timer", 60);',
    mc: "bossbar set <id> value <value>"
  },
  bossbar_set_max: {
    signature: "bossbar_set_max(id: string, max: int)",
    description: "Set boss bar maximum value.",
    params: [
      { name: "id", type: "string", desc: "Boss bar ID" },
      { name: "max", type: "int", desc: "Maximum value" }
    ],
    example: 'bossbar_set_max("mymod:timer", 300);',
    mc: "bossbar set <id> max <max>"
  },
  bossbar_remove: {
    signature: "bossbar_remove(id: string)",
    description: "Remove a boss bar.",
    params: [{ name: "id", type: "string", desc: "Boss bar ID" }],
    example: 'bossbar_remove("mymod:timer");',
    mc: "bossbar remove <id>"
  },
  bossbar_set_players: {
    signature: "bossbar_set_players(id: string, target: selector)",
    description: "Set which players see the boss bar.",
    params: [
      { name: "id", type: "string", desc: "Boss bar ID" },
      { name: "target", type: "selector", desc: "Target players" }
    ],
    example: 'bossbar_set_players("mymod:timer", @a);',
    mc: "bossbar set <id> players <target>"
  },
  bossbar_set_color: {
    signature: "bossbar_set_color(id: string, color: string)",
    description: "Set boss bar color.",
    params: [
      { name: "id", type: "string", desc: "Boss bar ID" },
      { name: "color", type: "string", desc: '"blue", "green", "pink", "purple", "red", "white", "yellow"' }
    ],
    example: 'bossbar_set_color("mymod:timer", "red");',
    mc: "bossbar set <id> color <color>"
  },
  bossbar_set_style: {
    signature: "bossbar_set_style(id: string, style: string)",
    description: "Set boss bar segmentation style.",
    params: [
      { name: "id", type: "string", desc: "Boss bar ID" },
      { name: "style", type: "string", desc: '"notched_6", "notched_10", "notched_12", "notched_20", "progress"' }
    ],
    example: 'bossbar_set_style("mymod:timer", "notched_10");'
  },
  bossbar_set_visible: {
    signature: "bossbar_set_visible(id: string, visible: bool)",
    description: "Show or hide a boss bar.",
    params: [
      { name: "id", type: "string", desc: "Boss bar ID" },
      { name: "visible", type: "bool", desc: "Visibility state" }
    ],
    example: 'bossbar_set_visible("mymod:timer", true);'
  },
  bossbar_get_value: {
    signature: "bossbar_get_value(id: string) -> int",
    description: "Get the current value of a boss bar.",
    params: [{ name: "id", type: "string", desc: "Boss bar ID" }],
    returns: "int",
    example: 'let v: int = bossbar_get_value("mymod:timer");',
    mc: "execute store result score $rs_tmp rs_tmp run bossbar get <id> value"
  },
  // --- Teams ---
  team_add: {
    signature: "team_add(name: string)",
    description: "Create a new team.",
    params: [{ name: "name", type: "string", desc: "Team name" }],
    example: 'team_add("red");',
    mc: "team add <name>"
  },
  team_remove: {
    signature: "team_remove(name: string)",
    description: "Remove a team.",
    params: [{ name: "name", type: "string", desc: "Team name" }],
    example: 'team_remove("red");',
    mc: "team remove <name>"
  },
  team_join: {
    signature: "team_join(name: string, target: selector)",
    description: "Add entities to a team.",
    params: [
      { name: "name", type: "string", desc: "Team name" },
      { name: "target", type: "selector", desc: "Entities to add" }
    ],
    example: 'team_join("red", @s);',
    mc: "team join <name> <target>"
  },
  team_leave: {
    signature: "team_leave(target: selector)",
    description: "Remove entities from their team.",
    params: [{ name: "target", type: "selector", desc: "Entities to remove" }],
    example: "team_leave(@s);",
    mc: "team leave <target>"
  },
  team_option: {
    signature: "team_option(name: string, option: string, value: string)",
    description: "Set a team option.",
    params: [
      { name: "name", type: "string", desc: "Team name" },
      { name: "option", type: "string", desc: 'Option name (e.g. "color", "friendlyFire")' },
      { name: "value", type: "string", desc: "Option value" }
    ],
    example: 'team_option("red", "color", "red");',
    mc: "team modify <name> <option> <value>"
  },
  // --- Decorators ---
  tick: {
    signature: "@tick  |  @tick(rate: int)",
    description: "Run this function every tick (rate=1) or every N ticks.",
    params: [{ name: "rate", type: "int", optional: true, desc: "Tick interval (default: 1). @tick(rate=20) = every second." }],
    example: "@tick(rate=20)\nfn every_second() { ... }"
  },
  on_advancement: {
    signature: "@on_advancement(id: string)",
    description: "Trigger when a player earns an advancement.",
    params: [{ name: "id", type: "string", desc: 'Advancement ID (e.g. "story/mine_diamond")' }],
    example: '@on_advancement("story/mine_diamond")\nfn got_diamond() { give(@s, "minecraft:diamond", 5); }'
  },
  on_death: {
    signature: "@on_death",
    description: "Trigger when the executing entity dies.",
    example: '@on_death\nfn died() { scoreboard_add(@s, "deaths", 1); }'
  },
  on_craft: {
    signature: "@on_craft(item: string)",
    description: "Trigger when a player crafts an item.",
    params: [{ name: "item", type: "string", desc: "Crafted item ID" }],
    example: '@on_craft("minecraft:diamond_sword")\nfn crafted_sword() { tell(@s, "Nice sword!"); }'
  }
};
function formatDoc(doc) {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = true;
  md.supportHtml = false;
  md.appendCodeblock(doc.signature, "redscript");
  md.appendText("\n");
  md.appendMarkdown(doc.description);
  md.appendText("\n");
  if (doc.params?.length) {
    md.appendText("\n");
    md.appendMarkdown("**Parameters:**\n");
    for (const p of doc.params) {
      const opt = p.optional ? "?" : "";
      md.appendMarkdown(`- \`${p.name}${opt}: ${p.type}\` \u2014 ${p.desc}
`);
    }
  }
  if (doc.returns) {
    md.appendMarkdown(`
**Returns:** \`${doc.returns}\`
`);
  }
  if (doc.mc) {
    md.appendText("\n");
    md.appendMarkdown("**Compiles to:**\n");
    md.appendCodeblock(doc.mc, "mcfunction");
  }
  if (doc.example) {
    md.appendMarkdown("**Example:**\n");
    md.appendCodeblock(doc.example, "redscript");
  }
  return md;
}
var SELECTOR_DOCS = {
  "@s": { name: "@s \u2014 Self", desc: "The entity that ran the current command (the executing entity).", tip: "Always refers to exactly 1 entity." },
  "@a": { name: "@a \u2014 All Players", desc: "All online players.", tip: "Use `@a[limit=1]` to restrict to one player." },
  "@e": { name: "@e \u2014 All Entities", desc: "All loaded entities (players + mobs + items + \u2026).", tip: "Usually combined with filters: `@e[type=minecraft:zombie,limit=5]`" },
  "@p": { name: "@p \u2014 Nearest Player", desc: "The single nearest player to the command origin.", tip: "Exactly 1 player; errors if none are in range." },
  "@r": { name: "@r \u2014 Random Player", desc: "A random online player.", tip: "Use `@e[type=minecraft:player,sort=random,limit=1]` for full control." },
  "@n": { name: "@n \u2014 Nearest Entity", desc: "The single nearest entity (including non-players).", tip: "MC 1.21+ only." }
};
var SELECTOR_ARG_DOCS = {
  "type": { name: "type", desc: "Filter by entity type.", example: "type=minecraft:zombie" },
  "tag": { name: "tag", desc: "Filter by scoreboard tag. Use `tag=!name` to exclude.", example: "tag=my_tag, tag=!excluded" },
  "name": { name: "name", desc: "Filter by entity custom name.", example: 'name="Steve"' },
  "team": { name: "team", desc: "Filter by team membership. Empty string = no team.", example: "team=red, team=" },
  "scores": { name: "scores", desc: "Filter by scoreboard scores. Uses `{obj=range}` syntax.", example: "scores={kills=1..}" },
  "nbt": { name: "nbt", desc: "Filter by NBT data match.", example: "nbt={OnGround:1b}" },
  "predicate": { name: "predicate", desc: "Filter by datapack predicate.", example: "predicate=my_pack:is_valid" },
  "gamemode": { name: "gamemode", desc: "Filter players by gamemode.", example: "gamemode=survival, gamemode=!creative" },
  "distance": { name: "distance", desc: "Filter by distance from command origin. Supports ranges.", example: "distance=..10, distance=5..20" },
  "level": { name: "level", desc: "Filter players by XP level.", example: "level=10.., level=1..5" },
  "x_rotation": { name: "x_rotation", desc: "Filter by vertical head rotation (pitch). -90=up, 90=down.", example: "x_rotation=-90..0" },
  "y_rotation": { name: "y_rotation", desc: "Filter by horizontal head rotation (yaw). South=0.", example: "y_rotation=0..90" },
  "x": { name: "x", desc: "Override X coordinate for distance/volume calculations.", example: "x=100" },
  "y": { name: "y", desc: "Override Y coordinate for distance/volume calculations.", example: "y=64" },
  "z": { name: "z", desc: "Override Z coordinate for distance/volume calculations.", example: "z=-200" },
  "dx": { name: "dx", desc: "X-size of selection box from x,y,z.", example: "dx=10" },
  "dy": { name: "dy", desc: "Y-size of selection box from x,y,z.", example: "dy=5" },
  "dz": { name: "dz", desc: "Z-size of selection box from x,y,z.", example: "dz=10" },
  "limit": { name: "limit", desc: "Maximum number of entities to select.", example: "limit=1, limit=5" },
  "sort": { name: "sort", desc: "Sort order: nearest, furthest, random, arbitrary.", example: "sort=random" },
  "advancements": { name: "advancements", desc: "Filter by advancement completion.", example: "advancements={story/mine_diamond=true}" }
};
function formatSelectorHover(raw) {
  const key = raw.replace(/\[.*/, "");
  const info = SELECTOR_DOCS[key];
  const md = new vscode.MarkdownString("", true);
  if (info) {
    md.appendMarkdown(`**${info.name}**

`);
    md.appendMarkdown(info.desc + "\n");
    if (info.tip) md.appendMarkdown(`
> \u{1F4A1} ${info.tip}`);
  } else {
    md.appendMarkdown(`**Selector** \`${raw}\`

Entity target selector.`);
  }
  return md;
}
function formatSelectorArgHover(arg) {
  const info = SELECTOR_ARG_DOCS[arg];
  if (!info) return null;
  const md = new vscode.MarkdownString("", true);
  md.appendMarkdown(`**${info.name}** (selector argument)

`);
  md.appendMarkdown(info.desc);
  if (info.example) {
    md.appendText("\n\n");
    md.appendCodeblock(info.example, "redscript");
  }
  return md;
}
function findJsDocAbove(document, declLine) {
  let end = declLine - 1;
  while (end >= 0 && document.lineAt(end).text.trim() === "") end--;
  if (end < 0) return null;
  const endText = document.lineAt(end).text.trim();
  if (!endText.endsWith("*/")) return null;
  let start = end;
  while (start >= 0 && !document.lineAt(start).text.includes("/**")) start--;
  if (start < 0) return null;
  const lines = [];
  for (let i = start; i <= end; i++) {
    let line = document.lineAt(i).text.replace(/^\s*\/\*\*?\s?/, "").replace(/\s*\*\/\s*$/, "").replace(/^\s*\*\s?/, "").trim();
    if (line) lines.push(line);
  }
  return lines.length ? lines.join("\n") : null;
}
function findFnDeclLine(document, name) {
  const re = new RegExp(`\\bfn\\s+${escapeRe(name)}\\s*\\(`, "m");
  const text = document.getText();
  const match = re.exec(text);
  if (!match) return null;
  return document.positionAt(match.index).line;
}
function findFnSignature(document, name) {
  const text = document.getText();
  const re = new RegExp(`\\bfn\\s+${escapeRe(name)}\\s*\\(([^)]*)\\)(?:\\s*->\\s*([A-Za-z_][A-Za-z0-9_\\[\\]]*))?\\s*\\{`, "m");
  const match = re.exec(text);
  if (!match) return null;
  const params = match[1].trim();
  let returnType = match[2];
  if (!returnType) {
    returnType = inferReturnType(text, match.index + match[0].length);
  }
  if (returnType) {
    return `fn ${name}(${params}) -> ${returnType}`;
  }
  return `fn ${name}(${params})`;
}
function inferReturnType(text, bodyStart) {
  let braceCount = 1;
  let pos = bodyStart;
  while (pos < text.length && braceCount > 0) {
    if (text[pos] === "{") braceCount++;
    else if (text[pos] === "}") braceCount--;
    pos++;
  }
  const body = text.slice(bodyStart, pos - 1);
  const returnMatch = body.match(/\breturn\s+(.+?);/);
  if (!returnMatch) return null;
  const returnExpr = returnMatch[1].trim();
  if (/^\d+$/.test(returnExpr)) return "int";
  if (/^\d+\.\d+$/.test(returnExpr)) return "float";
  if (/^\d+[bB]$/.test(returnExpr)) return "byte";
  if (/^\d+[sS]$/.test(returnExpr)) return "short";
  if (/^\d+[lL]$/.test(returnExpr)) return "long";
  if (/^\d+(\.\d+)?[dD]$/.test(returnExpr)) return "double";
  if (/^".*"$/.test(returnExpr)) return "string";
  if (/^(true|false)$/.test(returnExpr)) return "bool";
  if (/^@[aeprs]/.test(returnExpr)) return "selector";
  if (/^\{/.test(returnExpr)) return "struct";
  if (/^\[/.test(returnExpr)) return "array";
  const callMatch = returnExpr.match(/^(\w+)\s*\(/);
  if (callMatch) {
    const fnName = callMatch[1];
    if (["scoreboard_get", "score", "random", "random_native", "str_len", "len", "data_get", "bossbar_get_value", "set_contains"].includes(fnName)) {
      return "int";
    }
    if (fnName === "set_new") return "string";
  }
  return null;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findVarDecls(document) {
  const text = document.getText();
  const decls = [];
  const letRe = /\b(let|const)\s+(\w+)\s*:\s*([A-Za-z_][A-Za-z0-9_\[\]]*)/g;
  let m;
  while ((m = letRe.exec(text)) !== null) {
    decls.push({ kind: m[1], name: m[2], type: m[3] });
  }
  return decls;
}
function findFnParams(document) {
  const text = document.getText();
  const params = [];
  const fnRe = /\bfn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*\w+)?\s*\{/g;
  let fnMatch;
  while ((fnMatch = fnRe.exec(text)) !== null) {
    const fnName = fnMatch[1];
    const paramsStr = fnMatch[2];
    const fnStartOffset = fnMatch.index;
    const fnStartLine = document.positionAt(fnStartOffset).line;
    const bodyStart = fnMatch.index + fnMatch[0].length - 1;
    let braceCount = 1;
    let pos = bodyStart + 1;
    while (pos < text.length && braceCount > 0) {
      if (text[pos] === "{") braceCount++;
      else if (text[pos] === "}") braceCount--;
      pos++;
    }
    const fnEndLine = document.positionAt(pos).line;
    const paramRe = /(\w+)\s*:\s*([A-Za-z_][A-Za-z0-9_\[\]]*)/g;
    let paramMatch;
    while ((paramMatch = paramRe.exec(paramsStr)) !== null) {
      params.push({
        name: paramMatch[1],
        type: paramMatch[2],
        fnName,
        fnStartLine,
        fnEndLine
      });
    }
  }
  return params;
}
function findStructDecls(document) {
  const text = document.getText();
  const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/gs;
  const decls = [];
  let m;
  while ((m = structRe.exec(text)) !== null) {
    const name = m[1];
    const body = m[2];
    const structLine = document.positionAt(m.index).line;
    const bodyStartOffset = m.index + m[0].indexOf("{") + 1;
    const structDoc = findJsDocAbove(document, structLine);
    const fieldRe = /\b(\w+)\s*:\s*([A-Za-z_][A-Za-z0-9_\[\]]*)/g;
    const fields = [];
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      const fieldOffset = bodyStartOffset + fm.index;
      const fieldLine = document.positionAt(fieldOffset).line;
      const lineText = document.lineAt(fieldLine).text;
      const inlineMatch = lineText.match(/\/\/\s*(.+)$/);
      const docAbove = findFieldDocAbove(document, fieldLine);
      const fieldDoc = inlineMatch?.[1] || docAbove || void 0;
      fields.push({ name: fm[1], type: fm[2], line: fieldLine, doc: fieldDoc });
    }
    decls.push({ name, fields, line: structLine, doc: structDoc ?? void 0 });
  }
  return decls;
}
function findFieldDocAbove(document, fieldLine) {
  if (fieldLine === 0) return null;
  const prevLine = document.lineAt(fieldLine - 1).text.trim();
  if (prevLine.startsWith("//")) {
    return prevLine.replace(/^\/\/\s*/, "");
  }
  const blockMatch = prevLine.match(/\/\*\*?\s*(.*?)\s*\*\//);
  if (blockMatch) return blockMatch[1];
  if (prevLine.endsWith("*/")) {
    return findJsDocAbove(document, fieldLine);
  }
  return null;
}
function formatStructHover(decl) {
  const md = new vscode.MarkdownString("", true);
  const lines = [`struct ${decl.name} {`];
  for (const f of decl.fields) {
    const comment = f.doc ? `  // ${f.doc}` : "";
    lines.push(`    ${f.name}: ${f.type},${comment}`);
  }
  lines.push("}");
  md.appendCodeblock(lines.join("\n"), "redscript");
  if (decl.doc) {
    md.appendText("\n");
    md.appendMarkdown(decl.doc);
  }
  return md;
}
function formatFieldHover(structName, field) {
  const md = new vscode.MarkdownString("", true);
  md.appendCodeblock(`(field) ${structName}.${field.name}: ${field.type}`, "redscript");
  if (field.doc) {
    md.appendText("\n");
    md.appendMarkdown(field.doc);
  }
  return md;
}
function formatMcNameHover(name) {
  const md = new vscode.MarkdownString("", true);
  md.appendCodeblock(`#${name}`, "redscript");
  md.appendMarkdown(`MC identifier \`${name}\`

Used as an objective, tag, team, or gamerule name. Compiles to the bare name \`${name}\` without quotes.`);
  return md;
}
function registerHoverProvider(context) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider("redscript", {
      provideHover(document, position) {
        const line = document.lineAt(position.line).text;
        const mcRange = document.getWordRangeAtPosition(position, /#[a-zA-Z_][a-zA-Z0-9_]*/);
        if (mcRange) {
          const raw = document.getText(mcRange);
          return new vscode.Hover(formatMcNameHover(raw.slice(1)), mcRange);
        }
        const baseSelectorRange = document.getWordRangeAtPosition(position, /@[aesprnAESPRN]/);
        if (baseSelectorRange) {
          const base = document.getText(baseSelectorRange);
          return new vscode.Hover(formatSelectorHover(base), baseSelectorRange);
        }
        const wordAtCursor = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (wordAtCursor) {
          const wordText = document.getText(wordAtCursor);
          if (SELECTOR_ARG_DOCS[wordText]) {
            const afterWord2 = line.slice(wordAtCursor.end.character).trimStart();
            if (afterWord2.startsWith("=")) {
              const beforeWord = line.slice(0, wordAtCursor.start.character);
              const openBracket = beforeWord.lastIndexOf("[");
              const closeBracket = beforeWord.lastIndexOf("]");
              if (openBracket > closeBracket) {
                const beforeBracket = beforeWord.slice(0, openBracket);
                if (/@[aesprnAESPRN]\s*$/.test(beforeBracket)) {
                  const argDoc = formatSelectorArgHover(wordText);
                  if (argDoc) {
                    return new vscode.Hover(argDoc, wordAtCursor);
                  }
                }
              }
            }
          }
        }
        const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!range) return void 0;
        const word = document.getText(range);
        if (word === "_") {
          const md = new vscode.MarkdownString("", true);
          md.appendCodeblock("_", "redscript");
          md.appendMarkdown("**Wildcard pattern** (discard)\n\nMatches any value. Used in `match` expressions as a catch-all case, or to ignore unused values.");
          return new vscode.Hover(md, range);
        }
        const fnParams = findFnParams(document);
        const currentLine = position.line;
        const param = fnParams.find(
          (p) => p.name === word && currentLine >= p.fnStartLine && currentLine <= p.fnEndLine
        );
        if (param) {
          const md = new vscode.MarkdownString("", true);
          md.appendCodeblock(`(parameter) ${param.name}: ${param.type}`, "redscript");
          return new vscode.Hover(md, range);
        }
        const varDecls = findVarDecls(document);
        const varDecl = varDecls.find((v) => v.name === word);
        if (varDecl) {
          const md = new vscode.MarkdownString("", true);
          md.appendCodeblock(`${varDecl.kind} ${varDecl.name}: ${varDecl.type}`, "redscript");
          return new vscode.Hover(md, range);
        }
        const afterWord = line.slice(range.end.character).trimStart();
        const isCall = afterWord.startsWith("(");
        if (isCall) {
          const builtin = BUILTINS[word];
          if (builtin) return new vscode.Hover(formatDoc(builtin), range);
        }
        const structDecls = findStructDecls(document);
        const structDecl = structDecls.find((s) => s.name === word);
        if (structDecl) {
          return new vscode.Hover(formatStructHover(structDecl), range);
        }
        const charBefore = range.start.character > 0 ? line.slice(range.start.character - 1, range.start.character) : "";
        if (charBefore === ".") {
          const beforeDot = line.slice(0, range.start.character - 1);
          const objMatch = beforeDot.match(/([A-Za-z_]\w*)$/);
          if (objMatch) {
            const objName = objMatch[1];
            const objVar = varDecls.find((v) => v.name === objName);
            if (objVar) {
              const objStruct = structDecls.find((s) => s.name === objVar.type);
              if (objStruct) {
                const field = objStruct.fields.find((f) => f.name === word);
                if (field) {
                  return new vscode.Hover(formatFieldHover(objStruct.name, field), range);
                }
              }
            }
          }
        }
        const afterWordTrimmed = afterWord;
        if (afterWordTrimmed.startsWith(":")) {
          const textBefore = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
          const letMatch = textBefore.match(/let\s+\w+\s*:\s*(\w+)\s*=\s*\{[^}]*$/);
          const fnMatch = textBefore.match(/->\s*(\w+)\s*\{[^}]*return\s*\{[^}]*$/);
          const structType = letMatch?.[1] || fnMatch?.[1];
          if (structType) {
            const targetStruct = structDecls.find((s) => s.name === structType);
            if (targetStruct) {
              const field = targetStruct.fields.find((f) => f.name === word);
              if (field) {
                return new vscode.Hover(formatFieldHover(targetStruct.name, field), range);
              }
            }
          }
        }
        if (isCall) {
          const declLine = findFnDeclLine(document, word);
          if (declLine !== null) {
            const md = new vscode.MarkdownString("", true);
            const jsdoc = findJsDocAbove(document, declLine);
            const sig = findFnSignature(document, word) || `fn ${word}(...)`;
            md.appendCodeblock(sig, "redscript");
            if (jsdoc) {
              md.appendText("\n");
              md.appendMarkdown(jsdoc);
            }
            return new vscode.Hover(md, range);
          }
        }
        return void 0;
      }
    })
  );
}

// src/codeactions.ts
var vscode2 = __toESM(require("vscode"));
function registerCodeActions(context) {
  context.subscriptions.push(
    vscode2.languages.registerCodeActionsProvider(
      { language: "redscript", scheme: "file" },
      new RedScriptCodeActionProvider(),
      { providedCodeActionKinds: [vscode2.CodeActionKind.QuickFix] }
    )
  );
}
var RedScriptCodeActionProvider = class {
  provideCodeActions(document, range, context) {
    const actions = [];
    for (const diag of context.diagnostics) {
      if (diag.source !== "redscript") continue;
      if (diag.code === "W_UNNAMESPACED_TYPE") {
        const m = diag.message.match(/Unnamespaced entity type "([^"]+)"/);
        if (!m) continue;
        const typeName = m[1];
        const fix = new vscode2.CodeAction(
          `Add namespace: type=minecraft:${typeName}`,
          vscode2.CodeActionKind.QuickFix
        );
        fix.diagnostics = [diag];
        fix.isPreferred = true;
        const text = document.getText();
        const re = new RegExp(`\\btype=${escapeRe2(typeName)}(?![a-zA-Z0-9_:.])`, "g");
        const edit = new vscode2.WorkspaceEdit();
        let match;
        while ((match = re.exec(text)) !== null) {
          const start = document.positionAt(match.index + "type=".length);
          const end = document.positionAt(match.index + "type=".length + typeName.length);
          edit.replace(document.uri, new vscode2.Range(start, end), `minecraft:${typeName}`);
        }
        fix.edit = edit;
        actions.push(fix);
      }
    }
    const lineText = document.lineAt(range.start.line).text;
    const lineTypeRe = /\btype=([a-z][a-z0-9_]*)(?!\s*[:a-z0-9_])/g;
    let lm;
    while ((lm = lineTypeRe.exec(lineText)) !== null) {
      const typeName = lm[1];
      if (typeName.includes(":")) continue;
      if (actions.some((a) => a.title.includes(typeName))) continue;
      const fix = new vscode2.CodeAction(
        `Add namespace: type=minecraft:${typeName}`,
        vscode2.CodeActionKind.QuickFix
      );
      const col = lm.index + "type=".length;
      const start = new vscode2.Position(range.start.line, col);
      const end = new vscode2.Position(range.start.line, col + typeName.length);
      const edit = new vscode2.WorkspaceEdit();
      edit.replace(document.uri, new vscode2.Range(start, end), `minecraft:${typeName}`);
      fix.edit = edit;
      actions.push(fix);
    }
    return actions;
  }
};
function escapeRe2(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/completion.ts
var vscode3 = __toESM(require("vscode"));
var BUILTIN_FUNCTIONS = [
  { name: "say", detail: "say(msg: string)", doc: "Broadcast a message to all players as the server." },
  { name: "tell", detail: "tell(target: selector, msg: string)", doc: "Send a private message to a player or selector." },
  { name: "announce", detail: "announce(msg: string)", doc: "Send a message to all players in chat." },
  { name: "title", detail: "title(target: selector, msg: string)", doc: "Show a large title on screen for target players." },
  { name: "subtitle", detail: "subtitle(target: selector, msg: string)", doc: "Show subtitle text below the title." },
  { name: "actionbar", detail: "actionbar(target: selector, msg: string)", doc: "Show text in the action bar (above hotbar)." },
  { name: "title_times", detail: "title_times(target: selector, fadeIn: int, stay: int, fadeOut: int)", doc: "Set title display timing (in ticks)." },
  { name: "give", detail: "give(target: selector, item: string, count?: int)", doc: "Give item(s) to a player." },
  { name: "kill", detail: "kill(target?: selector)", doc: "Kill entity/entities. Defaults to @s." },
  { name: "effect", detail: "effect(target: selector, effect: string, duration?: int, amplifier?: int)", doc: "Apply a status effect." },
  { name: "clear", detail: "clear(target: selector, item?: string)", doc: "Remove items from inventory." },
  { name: "kick", detail: "kick(player: selector, reason?: string)", doc: "Kick a player from the server." },
  { name: "xp_add", detail: "xp_add(target: selector, amount: int, type?: string)", doc: "Add experience to a player." },
  { name: "xp_set", detail: "xp_set(target: selector, amount: int, type?: string)", doc: "Set a player's experience." },
  { name: "tp", detail: "tp(target: selector, destination: selector | BlockPos)", doc: "Teleport entity to a player or coordinates." },
  { name: "setblock", detail: "setblock(pos: BlockPos, block: string)", doc: "Place a block at coordinates." },
  { name: "fill", detail: "fill(from: BlockPos, to: BlockPos, block: string)", doc: "Fill a region with blocks." },
  { name: "clone", detail: "clone(from: BlockPos, to: BlockPos, dest: BlockPos)", doc: "Clone a region of blocks to a new location." },
  { name: "summon", detail: "summon(type: string, pos: BlockPos)", doc: "Spawn an entity at a location." },
  { name: "weather", detail: "weather(type: string)", doc: "Set the weather." },
  { name: "time_set", detail: "time_set(value: int | string)", doc: "Set the world time." },
  { name: "time_add", detail: "time_add(ticks: int)", doc: "Advance world time by ticks." },
  { name: "gamerule", detail: "gamerule(rule: string, value: bool | int)", doc: "Set a gamerule value." },
  { name: "difficulty", detail: "difficulty(level: string)", doc: "Set the game difficulty." },
  { name: "particle", detail: "particle(name: string, pos: BlockPos)", doc: "Spawn a particle effect." },
  { name: "playsound", detail: "playsound(sound: string, source: string, target: selector, pos?: BlockPos, volume?: float, pitch?: float)", doc: "Play a sound for a player." },
  { name: "tag_add", detail: "tag_add(target: selector, tag: string)", doc: "Add an entity tag." },
  { name: "tag_remove", detail: "tag_remove(target: selector, tag: string)", doc: "Remove an entity tag." },
  { name: "scoreboard_get", detail: "scoreboard_get(target: selector | string, objective: string) -> int", doc: "Read a scoreboard value." },
  { name: "score", detail: "score(target: selector | string, objective: string) -> int", doc: "Alias for scoreboard_get. Read a scoreboard value." },
  { name: "scoreboard_set", detail: "scoreboard_set(target: selector | string, objective: string, value: int)", doc: "Set a scoreboard value." },
  { name: "scoreboard_add", detail: "scoreboard_add(target: selector | string, objective: string, amount: int)", doc: "Add to a scoreboard value." },
  { name: "scoreboard_display", detail: "scoreboard_display(slot: string, objective: string)", doc: "Display a scoreboard objective in a slot." },
  { name: "scoreboard_add_objective", detail: "scoreboard_add_objective(name: string, criteria: string)", doc: "Create a new scoreboard objective." },
  { name: "scoreboard_remove_objective", detail: "scoreboard_remove_objective(name: string)", doc: "Remove a scoreboard objective." },
  { name: "scoreboard_hide", detail: "scoreboard_hide(slot: string)", doc: "Clear the display in a scoreboard slot." },
  { name: "random", detail: "random(min: int, max: int) -> int", doc: "Generate a random integer in range [min, max] using scoreboard arithmetic." },
  { name: "random_native", detail: "random_native(min: int, max: int) -> int", doc: "Generate a random integer using /random command (MC 1.20.3+). Faster than random()." },
  { name: "str_len", detail: "str_len(s: string) -> int", doc: "Get the length of a string (stored in NBT storage)." },
  { name: "push", detail: "push(arr: T[], value: T)", doc: "Append a value to the end of an array." },
  { name: "pop", detail: "pop(arr: T[]) -> T", doc: "Remove and return the last element of an array." },
  { name: "len", detail: "arr.len", doc: "Get the number of elements in an array (property access, not a function call).", kind: vscode3.CompletionItemKind.Property },
  { name: "data_get", detail: "data_get(target: string, path: string) -> int", doc: "Read NBT data from entity/block/storage." },
  { name: "bossbar_add", detail: "bossbar_add(id: string, name: string)", doc: "Create a new boss bar." },
  { name: "bossbar_set_value", detail: "bossbar_set_value(id: string, value: int)", doc: "Set boss bar current value." },
  { name: "bossbar_set_max", detail: "bossbar_set_max(id: string, max: int)", doc: "Set boss bar maximum value." },
  { name: "bossbar_remove", detail: "bossbar_remove(id: string)", doc: "Remove a boss bar." },
  { name: "bossbar_set_players", detail: "bossbar_set_players(id: string, target: selector)", doc: "Set which players see the boss bar." },
  { name: "bossbar_set_color", detail: "bossbar_set_color(id: string, color: string)", doc: "Set boss bar color." },
  { name: "bossbar_set_style", detail: "bossbar_set_style(id: string, style: string)", doc: "Set boss bar segmentation style." },
  { name: "bossbar_set_visible", detail: "bossbar_set_visible(id: string, visible: bool)", doc: "Show or hide a boss bar." },
  { name: "bossbar_get_value", detail: "bossbar_get_value(id: string) -> int", doc: "Get the current value of a boss bar." },
  { name: "team_add", detail: "team_add(name: string)", doc: "Create a new team." },
  { name: "team_remove", detail: "team_remove(name: string)", doc: "Remove a team." },
  { name: "team_join", detail: "team_join(name: string, target: selector)", doc: "Add entities to a team." },
  { name: "team_leave", detail: "team_leave(target: selector)", doc: "Remove entities from their team." },
  { name: "team_option", detail: "team_option(name: string, option: string, value: string)", doc: "Set a team option." },
  { name: "tick", detail: "@tick  |  @tick(rate: int)", doc: "Run this function every tick (rate=1) or every N ticks.", insertText: "@tick", kind: vscode3.CompletionItemKind.Event },
  { name: "on_advancement", detail: "@on_advancement(id: string)", doc: "Trigger when a player earns an advancement.", insertText: "@on_advancement", kind: vscode3.CompletionItemKind.Event },
  { name: "on_death", detail: "@on_death", doc: "Trigger when the executing entity dies.", insertText: "@on_death", kind: vscode3.CompletionItemKind.Event },
  { name: "on_craft", detail: "@on_craft(item: string)", doc: "Trigger when a player crafts an item.", insertText: "@on_craft", kind: vscode3.CompletionItemKind.Event }
];
var KEYWORDS = [
  "fn",
  "let",
  "const",
  "if",
  "else",
  "match",
  "foreach",
  "in",
  "return",
  "struct",
  "enum",
  "execute",
  "as",
  "at",
  "true",
  "false"
];
var TYPES = ["int", "float", "string", "bool", "void", "BlockPos", "selector"];
var TRIGGER_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_@".split("");
function registerCompletionProvider(context) {
  const provider = vscode3.languages.registerCompletionItemProvider(
    { language: "redscript", scheme: "file" },
    {
      provideCompletionItems() {
        const items = [];
        for (const builtin of BUILTIN_FUNCTIONS) {
          const item = new vscode3.CompletionItem(
            builtin.name,
            builtin.kind ?? vscode3.CompletionItemKind.Function
          );
          item.detail = builtin.detail;
          item.documentation = builtin.doc;
          item.insertText = builtin.insertText ?? builtin.name;
          items.push(item);
        }
        for (const keyword of KEYWORDS) {
          items.push(new vscode3.CompletionItem(keyword, vscode3.CompletionItemKind.Keyword));
        }
        for (const type of TYPES) {
          items.push(new vscode3.CompletionItem(type, vscode3.CompletionItemKind.TypeParameter));
        }
        return items;
      }
    },
    ...TRIGGER_CHARACTERS
  );
  context.subscriptions.push(provider);
}

// src/symbols.ts
var vscode4 = __toESM(require("vscode"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var DECL_RE = /\b(fn|let|const|struct|enum)\s+(\w+)/g;
function findDeclarations(doc) {
  const text = doc.getText();
  const decls = [];
  let match;
  DECL_RE.lastIndex = 0;
  while ((match = DECL_RE.exec(text)) !== null) {
    const nameStart = match.index + match[0].length - match[2].length;
    const pos = doc.positionAt(nameStart);
    const range = new vscode4.Range(pos, doc.positionAt(nameStart + match[2].length));
    decls.push({ kind: match[1], name: match[2], range });
  }
  return decls;
}
function findStructFields(doc) {
  const text = doc.getText();
  const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/gs;
  const fields = [];
  let sm;
  while ((sm = structRe.exec(text)) !== null) {
    const structName = sm[1];
    const bodyStart = sm.index + sm[0].indexOf("{") + 1;
    const body = sm[2];
    const fieldRe = /\b(\w+)\s*:/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      const fieldStart = bodyStart + fm.index;
      const pos = doc.positionAt(fieldStart);
      const range = new vscode4.Range(pos, doc.positionAt(fieldStart + fm[1].length));
      fields.push({ structName, fieldName: fm[1], fieldRange: range });
    }
  }
  return fields;
}
function isStructLiteralField(doc, position, word) {
  const line = doc.lineAt(position.line).text;
  const wordEnd = position.character + word.length;
  const afterWord = line.slice(wordEnd).trimStart();
  if (!afterWord.startsWith(":")) return null;
  const textBefore = doc.getText(new vscode4.Range(new vscode4.Position(0, 0), position));
  const letMatch = textBefore.match(/let\s+\w+\s*:\s*(\w+)\s*=\s*\{[^}]*$/);
  if (letMatch) return letMatch[1];
  const fnMatch = textBefore.match(/->\s*(\w+)\s*\{[^}]*return\s*\{[^}]*$/);
  if (fnMatch) return fnMatch[1];
  return null;
}
function isMemberAccessField(doc, position, word) {
  const line = doc.lineAt(position.line).text;
  const wordStart = position.character;
  const beforeWord = line.slice(0, wordStart);
  if (!beforeWord.endsWith(".")) return null;
  const varMatch = beforeWord.match(/(\w+)\s*\.$/);
  if (!varMatch) return null;
  const varName = varMatch[1];
  const text = doc.getText();
  const typeRe = new RegExp(`\\b(?:let|const)\\s+${varName}\\s*:\\s*(\\w+)`, "m");
  const typeMatch = text.match(typeRe);
  if (typeMatch) return typeMatch[1];
  const paramRe = new RegExp(`\\((?:[^)]*,\\s*)?${varName}\\s*:\\s*(\\w+)`, "m");
  const paramMatch = text.match(paramRe);
  if (paramMatch) return paramMatch[1];
  return null;
}
function findAllOccurrences(doc, word) {
  const text = doc.getText();
  const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "g");
  const locations = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    const pos = doc.positionAt(match.index);
    const range = new vscode4.Range(pos, doc.positionAt(match.index + word.length));
    locations.push(new vscode4.Location(doc.uri, range));
  }
  return locations;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var builtinLineCache = null;
function getBuiltinDtsPath(context) {
  return path.join(context.extensionPath, "builtins.d.mcrs");
}
function loadBuiltinLines(dtsPath) {
  if (builtinLineCache) return builtinLineCache;
  const cache = /* @__PURE__ */ new Map();
  try {
    const content = fs.readFileSync(dtsPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^declare fn (\w+)\(/);
      if (m) {
        cache.set(m[1], i);
      }
    }
  } catch {
  }
  builtinLineCache = cache;
  return cache;
}
var KNOWN_BUILTINS = /* @__PURE__ */ new Set([
  "say",
  "tell",
  "tellraw",
  "announce",
  "title",
  "subtitle",
  "actionbar",
  "title_times",
  "give",
  "kill",
  "effect",
  "effect_clear",
  "clear",
  "kick",
  "xp_add",
  "xp_set",
  "tp",
  "tp_to",
  "setblock",
  "fill",
  "clone",
  "summon",
  "particle",
  "playsound",
  "weather",
  "time_set",
  "time_add",
  "gamerule",
  "difficulty",
  "tag_add",
  "tag_remove",
  "scoreboard_get",
  "score",
  "scoreboard_set",
  "scoreboard_display",
  "scoreboard_hide",
  "scoreboard_add_objective",
  "scoreboard_remove_objective",
  "random",
  "random_native",
  "random_sequence",
  "data_get",
  "data_merge",
  "bossbar_add",
  "bossbar_set_value",
  "bossbar_set_max",
  "bossbar_set_color",
  "bossbar_set_style",
  "bossbar_set_visible",
  "bossbar_set_players",
  "bossbar_remove",
  "bossbar_get_value",
  "team_add",
  "team_remove",
  "team_join",
  "team_leave",
  "team_option",
  "set_new",
  "set_add",
  "set_contains",
  "set_remove",
  "set_clear",
  "setTimeout",
  "setInterval",
  "clearInterval"
]);
function registerSymbolProviders(context) {
  const selector = { language: "redscript", scheme: "file" };
  context.subscriptions.push(
    vscode4.languages.registerDefinitionProvider(selector, {
      provideDefinition(doc, position) {
        if (isMcName(doc, position)) return null;
        const wordRange = doc.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        const word = doc.getText(wordRange);
        const line = doc.lineAt(position.line).text;
        const afterWord = line.slice(wordRange.end.character).trimStart();
        if (afterWord.startsWith("(") && KNOWN_BUILTINS.has(word)) {
          const dtsPath = getBuiltinDtsPath(context);
          const lines = loadBuiltinLines(dtsPath);
          const lineNum = lines.get(word);
          if (lineNum !== void 0) {
            const dtsUri = vscode4.Uri.file(dtsPath);
            const pos = new vscode4.Position(lineNum, 0);
            return new vscode4.Location(dtsUri, pos);
          }
        }
        const structType = isStructLiteralField(doc, position, word);
        if (structType) {
          const structFields = findStructFields(doc);
          const field = structFields.find((f) => f.structName === structType && f.fieldName === word);
          if (field) {
            return new vscode4.Location(doc.uri, field.fieldRange);
          }
        }
        const memberAccess = isMemberAccessField(doc, position, word);
        if (memberAccess) {
          const structFields = findStructFields(doc);
          const field = structFields.find((f) => f.structName === memberAccess && f.fieldName === word);
          if (field) {
            return new vscode4.Location(doc.uri, field.fieldRange);
          }
        }
        const decls = findDeclarations(doc);
        const decl = decls.find((d) => d.name === word);
        if (!decl) return null;
        return new vscode4.Location(doc.uri, decl.range);
      }
    })
  );
  context.subscriptions.push(
    vscode4.languages.registerReferenceProvider(selector, {
      provideReferences(doc, position) {
        if (isMcName(doc, position)) {
          const mcRange = doc.getWordRangeAtPosition(position, /#[a-zA-Z_][a-zA-Z0-9_]*/);
          if (!mcRange) return null;
          const mcWord = doc.getText(mcRange);
          return findAllOccurrences(doc, mcWord);
        }
        const wordRange = doc.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        const word = doc.getText(wordRange);
        return findAllOccurrences(doc, word).filter((loc) => {
          const charBefore = loc.range.start.character > 0 ? doc.getText(new vscode4.Range(
            loc.range.start.translate(0, -1),
            loc.range.start
          )) : "";
          return charBefore !== "#";
        });
      }
    })
  );
  context.subscriptions.push(
    vscode4.languages.registerRenameProvider(selector, {
      provideRenameEdits(doc, position, newName) {
        const wordRange = doc.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        const oldName = doc.getText(wordRange);
        if (isMcName(doc, position)) return null;
        const edits = new vscode4.WorkspaceEdit();
        const text = doc.getText();
        const re = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g");
        let match;
        while ((match = re.exec(text)) !== null) {
          if (match.index > 0 && text[match.index - 1] === "#") continue;
          const start = doc.positionAt(match.index);
          const end = doc.positionAt(match.index + oldName.length);
          edits.replace(doc.uri, new vscode4.Range(start, end), newName);
        }
        return edits;
      },
      prepareRename(doc, position) {
        const wordRange = doc.getWordRangeAtPosition(position);
        if (!wordRange) throw new Error("Cannot rename this element");
        if (isMcName(doc, position)) {
          throw new Error("Cannot rename MC identifiers (#name)");
        }
        return wordRange;
      }
    })
  );
}
function isMcName(doc, position) {
  if (position.character === 0) return false;
  const charBefore = doc.getText(new vscode4.Range(
    position.translate(0, -1),
    position
  ));
  if (charBefore === "#") return true;
  const linePrefix = doc.lineAt(position.line).text.slice(0, position.character);
  const match = linePrefix.match(/#[a-zA-Z_][a-zA-Z0-9_]*$/);
  return match !== null;
}

// src/extension.ts
var { compile: _compile } = require_dist();
function getCompile() {
  return _compile ?? null;
}
var DEBOUNCE_MS = 600;
function activate(context) {
  const diagnostics = vscode5.languages.createDiagnosticCollection("redscript");
  context.subscriptions.push(diagnostics);
  const timers = /* @__PURE__ */ new Map();
  function scheduleValidation(doc) {
    if (doc.languageId !== "redscript") return;
    const key = doc.uri.toString();
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(key, setTimeout(() => {
      validateDocument(doc, diagnostics);
      timers.delete(key);
    }, DEBOUNCE_MS));
  }
  context.subscriptions.push(
    vscode5.workspace.onDidOpenTextDocument((doc) => scheduleValidation(doc))
  );
  context.subscriptions.push(
    vscode5.workspace.onDidChangeTextDocument((e) => scheduleValidation(e.document))
  );
  context.subscriptions.push(
    vscode5.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
      const key = doc.uri.toString();
      const t = timers.get(key);
      if (t) {
        clearTimeout(t);
        timers.delete(key);
      }
    })
  );
  vscode5.workspace.textDocuments.filter((d) => d.languageId === "redscript").forEach((d) => scheduleValidation(d));
  registerHoverProvider(context);
  registerCompletionProvider(context);
  registerCodeActions(context);
  registerSymbolProviders(context);
  const statusBar = vscode5.window.createStatusBarItem(vscode5.StatusBarAlignment.Left, 10);
  statusBar.text = "$(pass) RedScript";
  statusBar.tooltip = "RedScript compiler";
  statusBar.show();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode5.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "redscript") {
        statusBar.show();
      } else {
        statusBar.hide();
      }
    })
  );
}
function validateDocument(doc, collection) {
  const compile = getCompile();
  if (!compile) {
    collection.set(doc.uri, [{
      message: "RedScript compiler not found. Run `npm install -g redscript` to enable diagnostics.",
      range: new vscode5.Range(0, 0, 0, 0),
      severity: vscode5.DiagnosticSeverity.Information,
      source: "redscript"
    }]);
    return;
  }
  const source = doc.getText();
  const docDiagnostics = [];
  try {
    const result = compile(source, { filePath: doc.uri.fsPath });
    for (const w of result.warnings ?? []) {
      const range = w.line && w.col ? new vscode5.Range(w.line - 1, w.col - 1, w.line - 1, w.col - 1 + 20) : findWarningRange(w.message, w.code, source, doc);
      docDiagnostics.push({
        message: w.message,
        range,
        severity: vscode5.DiagnosticSeverity.Warning,
        source: "redscript",
        code: w.code
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let range;
    const loc = err.location;
    if (loc?.line && loc?.col) {
      const l = Math.max(0, loc.line - 1);
      const c = Math.max(0, loc.col - 1);
      range = new vscode5.Range(l, c, l, c + 20);
    } else {
      range = extractRange(msg, doc);
    }
    docDiagnostics.push({
      message: msg,
      range,
      severity: vscode5.DiagnosticSeverity.Error,
      source: "redscript"
    });
  }
  collection.set(doc.uri, docDiagnostics);
}
function findWarningRange(message, code, source, doc) {
  if (code === "W_UNNAMESPACED_TYPE") {
    const m = message.match(/"([^"]+)"/);
    if (m) return searchToken(source, doc, `type=${m[1]}`) ?? searchToken(source, doc, m[1]) ?? topLine(doc);
  }
  if (code === "W_QUOTED_SELECTOR") {
    const m = message.match(/"(@[^"]+)"/);
    if (m) return searchToken(source, doc, `"${m[1]}"`) ?? topLine(doc);
  }
  if (code === "W_DEPRECATED") {
    const m = message.match(/^(\w+) is deprecated/);
    if (m) return searchToken(source, doc, m[1]) ?? topLine(doc);
  }
  return topLine(doc);
}
function searchToken(source, doc, token) {
  const idx = source.indexOf(token);
  if (idx < 0) return null;
  const pos = doc.positionAt(idx);
  return new vscode5.Range(pos, doc.positionAt(idx + token.length));
}
function topLine(doc) {
  return new vscode5.Range(0, 0, 0, doc.lineAt(0).text.length);
}
function extractRange(msg, doc) {
  let m = msg.match(/line[: ]+(\d+)[,\s]+col(?:umn)?[: ]+(\d+)/i);
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1);
    const c = Math.max(0, parseInt(m[2]) - 1);
    return new vscode5.Range(l, c, l, c + 80);
  }
  m = msg.match(/^(\d+):(\d+)/);
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1);
    const c = Math.max(0, parseInt(m[2]) - 1);
    return new vscode5.Range(l, c, l, c + 80);
  }
  m = msg.match(/\[line (\d+)\]/i);
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1);
    return new vscode5.Range(l, 0, l, 200);
  }
  return new vscode5.Range(0, 0, 0, doc.lineAt(0).text.length);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
