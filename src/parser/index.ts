/**
 * RedScript Parser
 *
 * Recursive descent parser that converts tokens into an AST.
 * Uses precedence climbing for expression parsing.
 *
 * The Parser class extends a chain of sub-parsers:
 *   Parser → DeclParser → StmtParser → ExprParser → TypeParser → ParserBase
 *
 * Each layer adds methods for its domain; the full Parser assembles them
 * into the top-level `parse()` entry point.
 */

import { DiagnosticError } from '../diagnostics'
import type {
  Program, FnDecl, GlobalDecl, StructDecl, ImplBlock, EnumDecl,
  ConstDecl, ImportDecl,
  InterfaceDecl,
} from '../ast/types'
import { DeclParser } from './decl-parser'

export class Parser extends DeclParser {
  // -------------------------------------------------------------------------
  // Program (top-level entry point)
  // -------------------------------------------------------------------------

  parse(defaultNamespace = 'redscript'): Program {
    let namespace = defaultNamespace
    const globals: GlobalDecl[] = []
    const declarations: FnDecl[] = []
    const structs: StructDecl[] = []
    const implBlocks: ImplBlock[] = []
    const enums: EnumDecl[] = []
    const consts: ConstDecl[] = []
    const imports: ImportDecl[] = []
    const interfaces: InterfaceDecl[] = []
    let isLibrary = false
    let moduleName: string | undefined

    if (this.check('namespace')) {
      this.advance()
      const name = this.expect('ident')
      namespace = name.value
      this.match(';')
    }

    if (this.check('module')) {
      this.advance()
      const modKind = this.expect('ident')
      if (modKind.value === 'library') {
        isLibrary = true
        this.inLibraryMode = true
      } else {
        moduleName = modKind.value
      }
      this.match(';')
    }

    while (!this.check('eof')) {
      try {
        if (this.check('decorator') && this.peek().value.startsWith('@config')) {
          const decorToken = this.advance()
          const decorator = this.parseDecoratorValue(decorToken.value)
          if (!this.check('let')) {
            this.error('@config decorator must be followed by a let declaration')
          }
          const g = this.parseGlobalDecl(true)
          g.configKey = decorator.args?.configKey
          g.configDefault = decorator.args?.configDefault
          globals.push(g)
        } else if (this.check('let')) {
          globals.push(this.parseGlobalDecl(true))
        } else if (this.check('decorator') && this.peek().value === '@singleton') {
          this.advance()
          if (!this.check('struct')) {
            this.error('@singleton decorator must be followed by a struct declaration')
          }
          const s = this.parseStructDecl()
          s.isSingleton = true
          structs.push(s)
        } else if (this.check('struct')) {
          structs.push(this.parseStructDecl())
        } else if (this.check('impl')) {
          implBlocks.push(this.parseImplBlock())
        } else if (this.check('interface')) {
          interfaces.push(this.parseInterfaceDecl())
        } else if (this.check('enum')) {
          enums.push(this.parseEnumDecl())
        } else if (this.check('const')) {
          consts.push(this.parseConstDecl())
        } else if (this.check('declare')) {
          this.advance()
          this.parseDeclareStub()
        } else if (this.check('export')) {
          declarations.push(this.parseExportedFnDecl())
        } else if (this.check('import') || (this.check('ident') && this.peek().value === 'import')) {
          this.advance()
          const importToken = this.peek()
          const modName = this.expect('ident').value
          if (this.check('::')) {
            this.advance()
            let symbol: string
            if (this.check('*')) {
              this.advance()
              symbol = '*'
            } else {
              symbol = this.expect('ident').value
            }
            this.match(';')
            imports.push(this.withLoc({ moduleName: modName, symbol }, importToken))
          } else {
            this.match(';')
            imports.push(this.withLoc({ moduleName: modName, symbol: undefined }, importToken))
          }
        } else {
          declarations.push(this.parseFnDecl())
        }
      } catch (err) {
        if (err instanceof DiagnosticError) {
          this.parseErrors.push(err)
          this.syncToNextDecl()
        } else {
          throw err
        }
      }
    }

    return { namespace, moduleName, globals, declarations, structs, implBlocks, enums, consts, imports, interfaces, isLibrary }
  }
}
