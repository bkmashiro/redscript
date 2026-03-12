import * as readline from 'readline'

import { compile } from './index'
import type { DatapackFile } from './codegen/mcfunction'

const REPL_FN = '__repl'

export interface ReplEvaluation {
  source: string
  files: DatapackFile[]
  output: string
}

export class ReplSession {
  private declarations: string[] = []
  private statements: string[] = []

  constructor(private readonly namespace = 'repl') {}

  clear(): void {
    this.declarations = []
    this.statements = []
  }

  getSource(): string {
    const sections: string[] = []

    if (this.declarations.length > 0) {
      sections.push(this.declarations.join('\n\n'))
    }

    const body = this.statements.map(stmt => `  ${stmt}`).join('\n')
    sections.push(`fn ${REPL_FN}() {\n${body}${body ? '\n' : ''}}`)

    return sections.join('\n\n')
  }

  evaluate(input: string): ReplEvaluation {
    const trimmed = input.trim()
    if (!trimmed) {
      return { source: this.getSource(), files: [], output: '' }
    }

    const declaration = isTopLevelDeclaration(trimmed)
    const normalized = declaration ? trimmed : normalizeStatement(trimmed)

    const nextDeclarations = declaration ? [...this.declarations, normalized] : [...this.declarations]
    const nextStatements = declaration ? [...this.statements] : [...this.statements, normalized]
    const source = buildSource(nextDeclarations, nextStatements)
    const result = compile(source, { namespace: this.namespace })
    const files = selectRelevantFiles(result.files, this.namespace, declaration)

    this.declarations = nextDeclarations
    this.statements = nextStatements

    return {
      source,
      files,
      output: formatFiles(files, declaration),
    }
  }
}

export async function startRepl(namespace = 'repl'): Promise<void> {
  const session = new ReplSession(namespace)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  console.log('RedScript REPL. Type :help for commands.')

  try {
    while (true) {
      const line = await question(rl, 'rs> ')
      const trimmed = line.trim()

      if (trimmed === ':quit') {
        break
      }

      if (trimmed === ':help') {
        console.log([
          'Commands:',
          '  :help  Show REPL commands',
          '  :clear Reset declarations and statements',
          '  :quit  Exit the REPL',
        ].join('\n'))
        continue
      }

      if (trimmed === ':clear') {
        session.clear()
        console.log('State cleared.')
        continue
      }

      try {
        const evaluation = session.evaluate(line)
        if (evaluation.output) {
          console.log(evaluation.output)
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
      }
    }
  } finally {
    rl.close()
  }
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve))
}

function buildSource(declarations: string[], statements: string[]): string {
  const sections: string[] = []

  if (declarations.length > 0) {
    sections.push(declarations.join('\n\n'))
  }

  const body = statements.map(stmt => `  ${stmt}`).join('\n')
  sections.push(`fn ${REPL_FN}() {\n${body}${body ? '\n' : ''}}`)

  return sections.join('\n\n')
}

function isTopLevelDeclaration(line: string): boolean {
  return /^(?:@\w+(?:\([^)]*\))?\s*)*(fn|struct|enum)\b/.test(line)
}

function normalizeStatement(line: string): string {
  if (/[;}]$/.test(line)) {
    return line
  }
  return `${line};`
}

function selectRelevantFiles(files: DatapackFile[], namespace: string, declaration: boolean): DatapackFile[] {
  if (declaration) {
    const functionFiles = files.filter(file =>
      file.path.startsWith(`data/${namespace}/function/`) &&
      file.path.endsWith('.mcfunction') &&
      !file.path.includes(`/${REPL_FN}/`) &&
      !file.path.endsWith('/__load.mcfunction') &&
      !file.path.endsWith('/__tick.mcfunction')
    )
    return functionFiles
  }

  return files.filter(file =>
    file.path.startsWith(`data/${namespace}/function/${REPL_FN}`) &&
    file.path.endsWith('.mcfunction')
  )
}

function formatFiles(files: DatapackFile[], declaration: boolean): string {
  if (files.length === 0) {
    return declaration ? 'Accepted. No mcfunction output for this declaration yet.' : ''
  }

  return files.map(file => `${file.path}\n${file.content}`).join('\n\n')
}
