/**
 * DeclParser — declaration parsing (fn/struct/enum/impl/interface/const/global/import).
 * Extends StmtParser so declaration methods can call block/statement methods.
 */

import type {
  FnDecl, StructDecl, StructField, EnumDecl, EnumVariant, ImplBlock,
  InterfaceDecl, InterfaceMethod, ConstDecl, GlobalDecl, Decorator,
  TypeNode, Expr, ResourceDecl, TagResourceBuilder, TagResourceValue,
} from '../ast/types'
import { isTagResourceArtifactKind } from '../artifacts/registry'
import { StmtParser } from './stmt-parser'

const RESOURCE_LOCATION_RE = /^[a-z0-9_.-]+:[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/

export class DeclParser extends StmtParser {
  // -------------------------------------------------------------------------
  // Struct
  // -------------------------------------------------------------------------

  parseStructDecl(): StructDecl {
    const structToken = this.expect('struct')
    const name = this.expect('ident').value
    const extendsName = this.match('extends') ? this.expect('ident').value : undefined
    this.expect('{')

    const fields: StructField[] = []
    while (!this.check('}') && !this.check('eof')) {
      const fieldName = this.expect('ident').value
      this.expect(':')
      const fieldType = this.parseType()
      fields.push({ name: fieldName, type: fieldType })
      this.match(',')
    }

    this.expect('}')
    return this.withLoc({ name, extends: extendsName, fields }, structToken)
  }

  // -------------------------------------------------------------------------
  // Enum
  // -------------------------------------------------------------------------

  parseEnumDecl(): EnumDecl {
    const enumToken = this.expect('enum')
    const name = this.expect('ident').value
    this.expect('{')

    const variants: EnumVariant[] = []
    let nextValue = 0

    while (!this.check('}') && !this.check('eof')) {
      const variantToken = this.expect('ident')
      const variant: EnumVariant = { name: variantToken.value }

      if (this.check('(')) {
        this.advance()
        const fields: { name: string; type: TypeNode }[] = []
        while (!this.check(')') && !this.check('eof')) {
          const fieldName = this.expect('ident').value
          this.expect(':')
          const fieldType = this.parseType()
          fields.push({ name: fieldName, type: fieldType })
          if (!this.match(',')) break
        }
        this.expect(')')
        variant.fields = fields
      }

      if (this.match('=')) {
        const valueToken = this.expect('int_lit')
        variant.value = parseInt(valueToken.value, 10)
        nextValue = variant.value + 1
      } else {
        variant.value = nextValue++
      }

      variants.push(variant)
      if (!this.match(',')) break
    }

    this.expect('}')
    return this.withLoc({ name, variants }, enumToken)
  }

  // -------------------------------------------------------------------------
  // Impl Block
  // -------------------------------------------------------------------------

  parseImplBlock(): ImplBlock {
    const implToken = this.expect('impl')
    let traitName: string | undefined
    let typeName: string
    const firstName = this.expect('ident').value
    if (this.match('for')) {
      traitName = firstName
      typeName = this.expect('ident').value
    } else {
      typeName = firstName
    }
    this.expect('{')

    const methods: FnDecl[] = []
    while (!this.check('}') && !this.check('eof')) {
      const doc = this.consumeDocComment()
      if (this.check('}') || this.check('eof')) break
      methods.push(this.attachDoc(this.parseFnDecl(typeName), doc))
    }

    this.expect('}')
    return this.withLoc({ kind: 'impl_block', traitName, typeName, methods }, implToken)
  }

  // -------------------------------------------------------------------------
  // Interface
  // -------------------------------------------------------------------------

  parseInterfaceDecl(): InterfaceDecl {
    const ifaceToken = this.expect('interface')
    const name = this.expect('ident').value
    this.expect('{')

    const methods: InterfaceMethod[] = []
    while (!this.check('}') && !this.check('eof')) {
      const doc = this.consumeDocComment()
      if (this.check('}') || this.check('eof')) break
      const fnToken = this.expect('fn')
      const methodName = this.expect('ident').value
      this.expect('(')
      const params = this.parseInterfaceParams()
      this.expect(')')
      let returnType: TypeNode | undefined
      if (this.match(':')) returnType = this.parseType()
      methods.push(this.attachDoc(this.withLoc({ name: methodName, params, returnType }, fnToken) as InterfaceMethod, doc))
    }

    this.expect('}')
    return this.withLoc({ name, methods }, ifaceToken) as InterfaceDecl
  }

  // -------------------------------------------------------------------------
  // Const / Global
  // -------------------------------------------------------------------------

  parseConstDecl(): ConstDecl {
    const constToken = this.expect('const')
    const name = this.expect('ident').value
    let type: TypeNode | undefined
    if (this.match(':')) type = this.parseType()
    this.expect('=')
    const value = this.parseLiteralExpr()
    this.match(';')
    const inferredType: TypeNode = type ?? (
      value.kind === 'str_lit' ? { kind: 'named', name: 'string' } :
      value.kind === 'bool_lit' ? { kind: 'named', name: 'bool' } :
      value.kind === 'float_lit' ? { kind: 'named', name: 'fixed' } :
      { kind: 'named', name: 'int' }
    )
    return this.withLoc({ name, type: inferredType, value }, constToken)
  }

  parseGlobalDecl(mutable: boolean): GlobalDecl {
    const token = this.advance() // consume 'let'
    const name = this.expect('ident').value
    this.expect(':')
    const type = this.parseType()
    let init: Expr
    if (this.match('=')) {
      init = this.parseExpr()
    } else {
      init = { kind: 'int_lit', value: 0 }
    }
    this.match(';')
    return this.withLoc({ kind: 'global', name, type, init, mutable }, token)
  }

  // -------------------------------------------------------------------------
  // Function
  // -------------------------------------------------------------------------

  parseExportedFnDecl(): FnDecl {
    this.expect('export')
    const fn = this.check('declare') ? this.parseDeclareStub() : this.parseFnDecl()
    fn.isExported = true
    return fn
  }

  parseFnDecl(implTypeName?: string): FnDecl {
    const decorators = this.parseDecorators()
    const watchObjective = decorators.find(decorator => decorator.name === 'watch')?.args?.objective

    let isExported: boolean | undefined
    const filteredDecorators = decorators.filter(d => {
      if (d.name === 'keep') {
        isExported = true
        return false
      }
      return true
    })

    const fnToken = this.expect('fn')
    const name = this.expect('ident').value

    let typeParams: string[] | undefined
    if (this.check('<')) {
      this.advance()
      typeParams = []
      do {
        typeParams.push(this.expect('ident').value)
      } while (this.match(','))
      this.expect('>')
    }

    this.expect('(')
    const params = this.parseParams(implTypeName)
    this.expect(')')

    let returnType: TypeNode = { kind: 'named', name: 'void' }
    if (this.match('->') || this.match(':')) {
      returnType = this.parseType()
    }

    const body = this.parseBlock()
    const closingBraceLine = this.tokens[this.pos - 1]?.line

    const fn: FnDecl = this.withLoc(
      { name, typeParams, params, returnType, decorators: filteredDecorators, body,
        isLibraryFn: this.inLibraryMode || undefined, isExported, watchObjective },
      fnToken,
    )
    if (fn.span && closingBraceLine) fn.span.endLine = closingBraceLine
    return fn
  }

  parseDeclareStub(): FnDecl {
    const decorators = this.parseDecorators()
    const watchObjective = decorators.find(decorator => decorator.name === 'watch')?.args?.objective

    let isExported: boolean | undefined
    const filteredDecorators = decorators.filter(d => {
      if (d.name === 'keep') {
        isExported = true
        return false
      }
      return true
    })

    const declareToken = this.expect('declare')
    this.expect('fn')
    const name = this.expect('ident').value

    let typeParams: string[] | undefined
    if (this.check('<')) {
      this.advance()
      typeParams = []
      do {
        typeParams.push(this.expect('ident').value)
      } while (this.match(','))
      this.expect('>')
    }

    this.expect('(')
    const params = this.parseParams()
    this.expect(')')

    let returnType: TypeNode = { kind: 'named', name: 'void' }
    if (this.match('->') || this.match(':')) {
      returnType = this.parseType()
    }

    this.match(';')

    return this.withLoc(
      {
        name,
        typeParams,
        params,
        returnType,
        decorators: filteredDecorators,
        body: [],
        isLibraryFn: this.inLibraryMode || undefined,
        isExported,
        watchObjective,
        isDeclareOnly: true,
      },
      declareToken,
    )
  }

  private parseTagResourceLocation(): string {
    const namespace = this.expect('ident').value
    this.expect(':')
    const pathTokens: string[] = []
    while (!this.check(';') && !this.check('eof')) {
      const token = this.advance()
      if (!['ident', 'int_lit', '/', '-', '.'].includes(token.kind)) {
        this.error(`Invalid tag resource id token '${token.value}'`)
      }
      pathTokens.push(token.value)
    }
    const id = `${namespace}:${pathTokens.join('')}`
    if (!RESOURCE_LOCATION_RE.test(id)) {
      this.error(`Invalid tag resource id '${id}'`)
    }
    return id
  }

  private parseTagResourceBuilder(registry: string): TagResourceBuilder {
    if (!isTagResourceArtifactKind(registry)) {
      this.error(`A typed tag builder requires a tag resource kind, got '${registry}'`)
    }
    this.expect('{')
    let policy: TagResourceBuilder['policy'] = 'merge'
    let hasPolicy = false
    const values: TagResourceValue[] = []

    while (!this.check('}') && !this.check('eof')) {
      const entryToken = this.peek()
      if (this.checkIdent('policy')) {
        this.advance()
        if (hasPolicy) this.error('A typed tag policy may not be declared more than once')
        const policyToken = this.expect('ident')
        if (policyToken.value !== 'merge' && policyToken.value !== 'replace') {
          this.error(`Expected tag policy 'merge' or 'replace', got '${policyToken.value}'`)
        }
        policy = policyToken.value
        hasPolicy = true
        this.expect(';')
        continue
      }

      let required = true
      if (this.checkIdent('optional')) {
        this.advance()
        required = false
      }
      const kindToken = this.expect('ident')
      if (kindToken.value !== 'value' && kindToken.value !== 'tag') {
        this.error("Expected typed tag entry 'policy', 'value', or 'tag'")
      }
      const id = this.parseTagResourceLocation()
      this.expect(';')
      values.push(this.withLoc({ kind: kindToken.value, id, required }, entryToken))
    }
    this.expect('}')
    return { kind: 'tag', policy, values }
  }

  /** Parse `resource <registry> <namespace>:<path> [from "<asset-path>" | { <typed tag body> }];`. */
  parseResourceDecl(): ResourceDecl {
    const resourceToken = this.expect('ident')
    if (resourceToken.value !== 'resource') {
      this.error("Expected 'resource' declaration")
    }

    const registry = this.expect('ident').value
    const namespaceToken = this.expect('ident')
    const namespace = namespaceToken.value
    this.expect(':')

    const pathTokens: string[] = []
    while (!this.check(';') && !this.check('{') && !this.check('eof')) {
      const previousPathToken = pathTokens[pathTokens.length - 1]
      const startsFromClause = pathTokens.length > 0
        && previousPathToken !== '/'
        && previousPathToken !== '-'
        && previousPathToken !== '.'
        && this.check('ident')
        && this.peek().value === 'from'
      if (startsFromClause) break
      const token = this.advance()
      if (!['ident', 'int_lit', '/', '-', '.'].includes(token.kind)) {
        this.error(`Invalid resource path token '${token.value}'`)
      }
      pathTokens.push(token.value)
    }
    const resourcePath = pathTokens.join('')
    if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/.test(resourcePath)) {
      this.error(`Invalid resource path '${resourcePath}'`)
    }

    let sourcePath: string | undefined
    if (this.check('ident') && this.peek().value === 'from') {
      this.advance()
      const source = this.expect('string_lit')
      sourcePath = source.value
      if (
        !sourcePath ||
        sourcePath.startsWith('/') ||
        /^[A-Za-z]:[\\/]/.test(sourcePath) ||
        sourcePath.includes('\\') ||
        sourcePath.split('/').some(segment => !segment || segment === '.' || segment === '..')
      ) {
        this.error(`Resource source must be a canonical relative asset path, got '${sourcePath}'`)
      }
    }
    let builder: TagResourceBuilder | undefined
    if (this.check('{')) {
      if (sourcePath) {
        this.error('A resource contribution cannot combine from-file and typed builder forms')
      }
      builder = this.parseTagResourceBuilder(registry)
    }
    this.match(';')

    return this.withLoc({
      registry,
      id: `${namespace}:${resourcePath}`,
      namespace,
      path: resourcePath,
      sourcePath,
      builder,
      doc: '',
    }, resourceToken)
  }

  // -------------------------------------------------------------------------
  // Decorators
  // -------------------------------------------------------------------------

  private parseDecorators(): Decorator[] {
    const decorators: Decorator[] = []
    while (this.check('decorator')) {
      const token = this.advance()
      const decorator = this.parseDecoratorValue(token.value)
      decorators.push(decorator)
    }
    return decorators
  }

  parseDecoratorValue(value: string): Decorator {
    const match = value.match(/^@([A-Za-z_][A-Za-z0-9_-]*)(?:\((.*)\))?$/s)
    if (!match) {
      this.error(`Invalid decorator: ${value}`)
    }

    const name = match[1] as Decorator['name']
    const argsStr = match[2]

    if (!argsStr) return { name }

    if (name === 'profile' || name === 'benchmark' || name === 'memoize') {
      this.error(`@${name} decorator does not accept arguments`)
    }

    const args: Decorator['args'] = {}

    if (name === 'on') {
      const eventTypeMatch = argsStr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)
      if (eventTypeMatch) {
        args.eventType = eventTypeMatch[1]
        return { name, args }
      }
    }

    if (name === 'function_tag') {
      const strMatch = argsStr.match(/^"([^"]+)"$/)
      if (strMatch) {
        args.functionTag = strMatch[1]
        return { name, args }
      }
      this.error('Invalid @function_tag syntax. Expected: @function_tag("namespace:path")')
    }

    if (name === 'watch' || name === 'on_trigger' || name === 'on_advancement' || name === 'on_craft' || name === 'on_join_team') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) {
        if (name === 'watch') args.objective = strMatch[1]
        else if (name === 'on_trigger') args.trigger = strMatch[1]
        else if (name === 'on_advancement') args.advancement = strMatch[1]
        else if (name === 'on_craft') args.item = strMatch[1]
        else if (name === 'on_join_team') args.team = strMatch[1]
        return { name, args }
      }
    }

    if (name === 'config') {
      const configMatch = argsStr.match(/^"([^"]+)"\s*,\s*default\s*:\s*(-?\d+(?:\.\d+)?)$/)
      if (configMatch) {
        return { name, args: { configKey: configMatch[1], configDefault: parseFloat(configMatch[2]) } }
      }
      const keyOnlyMatch = argsStr.match(/^"([^"]+)"$/)
      if (keyOnlyMatch) {
        return { name, args: { configKey: keyOnlyMatch[1] } }
      }
      this.error(`Invalid @config syntax. Expected: @config("key", default: value) or @config("key")`)
    }

    if (name === 'deprecated') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) return { name, args: { message: strMatch[1] } }
      return { name, args: {} }
    }

    if (name === 'test') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) return { name, args: { testLabel: strMatch[1] } }
      return { name, args: { testLabel: '' } }
    }

    if (name === 'require_on_load') {
      const rawArgs: NonNullable<Decorator['rawArgs']> = []
      for (const part of argsStr.split(',')) {
        const trimmed = part.trim()
        const identMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)
        if (identMatch) {
          rawArgs.push({ kind: 'string', value: identMatch[1] })
        } else {
          const strMatch = trimmed.match(/^"([^"]*)"$/)
          if (strMatch) rawArgs.push({ kind: 'string', value: strMatch[1] })
        }
      }
      return { name, rawArgs }
    }

    for (const part of argsStr.split(',')) {
      const [key, val] = part.split('=').map(s => s.trim())
      if (key === 'rate') args.rate = parseInt(val, 10)
      else if (key === 'ticks') args.ticks = parseInt(val, 10)
      else if (key === 'batch') args.batch = parseInt(val, 10)
      else if (key === 'onDone') args.onDone = val.replace(/^["']|["']$/g, '')
      else if (key === 'trigger') args.trigger = val
      else if (key === 'advancement') args.advancement = val
      else if (key === 'item') args.item = val
      else if (key === 'team') args.team = val
      else if (key === 'max') args.max = parseInt(val, 10)
    }

    return { name, args }
  }
}
