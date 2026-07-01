import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../..')

const grammarPath = path.join(repoRoot, 'editors/vscode/syntaxes/redscript.tmLanguage.json')
const packagePath = path.join(repoRoot, 'editors/vscode/package.json')

const grammarText = fs.readFileSync(grammarPath, 'utf8')
const grammar = JSON.parse(grammarText)
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

function regexFromTmRule(rule: string): RegExp {
  return new RegExp(rule)
}

function collectPatternStrings(node: unknown): string[] {
  const seen = new Set<string>()

  const visit = (value: unknown): string[] => {
    if (!value || typeof value !== 'object') {
      return []
    }

    const obj = value as {
      [key: string]: unknown
      patterns?: unknown[]
      match?: string
      begin?: string
      end?: string
      include?: string
    }

    const out: string[] = []

    if (typeof obj.match === 'string') out.push(obj.match)
    if (typeof obj.begin === 'string') out.push(obj.begin)
    if (typeof obj.end === 'string') out.push(obj.end)

    if (Array.isArray(obj.patterns)) {
      for (const item of obj.patterns) {
        out.push(...visit(item))
      }
    }

    if (typeof obj.include === 'string' && obj.include.startsWith('#')) {
      const ref = obj.include.slice(1)
      if (!seen.has(ref) && grammar.repository?.[ref]) {
        seen.add(ref)
        out.push(...visit(grammar.repository[ref]))
      }
    }

    return out
  }

  return visit(node)
}

describe('vscode TextMate grammar smoke', () => {
  it('keeps f-string highlighting rule', () => {
    expect(grammar.repository?.fstring).toBeDefined()
    expect(grammar.repository?.fstring?.begin).toBe('(f)(\")')
  })

  it('highlights objective and #rs tokens', () => {
    const mcNameMatches = collectPatternStrings(grammar.repository?.['mc-name'])
    expect(mcNameMatches.some((rule) => regexFromTmRule(rule).test('#objective'))).toBe(true)
    expect(mcNameMatches.some((rule) => regexFromTmRule(rule).test('#rs'))).toBe(true)
  })

  it('highlights unquoted namespace resources at root scope', () => {
    const rootIncludes = (grammar.repository?.root?.patterns ?? []).map((pattern: unknown) =>
      (pattern as { include?: string }).include,
    )
    expect(rootIncludes).toContain('#mc-resource')
    expect(rootIncludes).toContain('#resource-generic')

    const resourceMatches = collectPatternStrings(grammar.repository?.['mc-resource'])
    const hasNamespaceResourceRule = resourceMatches.some((rule) => {
      const regex = regexFromTmRule(rule)
      return regex.test('minecraft:flame') && regex.test('custom:some/path') && !regex.test('not_a_resource')
    })
    expect(hasNamespaceResourceRule).toBe(true)
  })

  it('highlights resource<...> generic references', () => {
    const resourceGenericMatches = collectPatternStrings(grammar.repository?.['resource-generic'])
    const hasResourceGeneric = resourceGenericMatches.some((rule) => {
      const regex = regexFromTmRule(rule)
      return regex.test('resource<particle>') && regex.test('resource<minecraft:particle>') && !regex.test('resource<>')
    })
    expect(hasResourceGeneric).toBe(true)
  })

  it('highlights selector internals: keys, namespace values, and operators', () => {
    const selectorMatches = collectPatternStrings(grammar.repository?.selectors)

    const hasSelectorKeyList = selectorMatches.some((rule) =>
      rule.includes('type|name|tag|team|scores|nbt|predicate|gamemode|distance|level|x_rotation|y_rotation|x|y|z|dx|dy|dz|limit|sort|advancements|selector|family'),
    )
    const hasSelectorNamespaceValue = selectorMatches.some((rule) => {
      const regex = regexFromTmRule(rule)
      return regex.test('minecraft:zombie') && regex.test('custom:entity-name')
    })
    const hasSelectorRange = selectorMatches.some((rule) => regexFromTmRule(rule).test('..'))
    const hasSelectorLogical = selectorMatches.some((rule) => {
      const regex = regexFromTmRule(rule)
      return regex.test('!') && regex.test('&&') && regex.test('||')
    })
    const hasSelectorAssign = selectorMatches.some((rule) => {
      const regex = regexFromTmRule(rule)
      return regex.test('=') && regex.test('!=') && regex.test('<=') && regex.test('>=')
    })

    expect(hasSelectorKeyList).toBe(true)
    expect(hasSelectorNamespaceValue).toBe(true)
    expect(hasSelectorRange).toBe(true)
    expect(hasSelectorLogical).toBe(true)
    expect(hasSelectorAssign).toBe(true)
  })

  it('captures `declare fn` as a declaration pattern', () => {
    const rootPatterns = (grammar.repository?.root?.patterns ?? []).map((pattern: unknown) =>
      (pattern as { include?: string }).include,
    )
    expect(rootPatterns).toContain('#declare-fn-definition')

    const declareFnRules = collectPatternStrings(grammar.repository?.['declare-fn-definition'])
    const hasDeclareFnPattern = declareFnRules.some((rule) => regexFromTmRule(rule).test('declare fn external_call'))
    expect(hasDeclareFnPattern).toBe(true)
  })

  it('contains redscript grammar contribution in package.json', () => {
    const grammars = packageJson?.contributes?.grammars ?? []
    const redscriptGrammar = grammars.find(
      (entry: { language?: string; path?: string }) =>
        entry?.language === 'redscript' && entry?.path === './syntaxes/redscript.tmLanguage.json',
    )
    expect(redscriptGrammar).toBeDefined()
  })
})
