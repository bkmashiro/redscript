import { spawnSync } from 'child_process'
import * as path from 'path'

test('misplaced headers produce diagnostics and recover without a non-progress loop', () => {
  const code = `
    const {Lexer}=require('./src/lexer'); const {Parser}=require('./src/parser');
    for (const source of [
      'import math; module library; fn main(): void {}',
      'fn a(): void {} namespace late; fn main(): void {}',
      'fn a(): void {} package late; fn main(): void {}'
    ]) {
      const parser=new Parser(new Lexer(source).tokenize(),source);
      const ast=parser.parse('test');
      if(!parser.parseErrors.length || !ast.declarations.some(f=>f.name==='main')) process.exit(2);
    }
    console.log('recovered');
  `
  const result = spawnSync(process.execPath, ['--max-old-space-size=256', '-r', require.resolve('ts-node/register/transpile-only'), '-e', code], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 10000,
  })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('recovered')
}, 15000)
