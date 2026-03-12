import { compile, check } from '../index'
import * as fs from 'fs'
import * as path from 'path'

describe('CLI API', () => {
  describe('compile()', () => {
    it('compiles simple source', () => {
      const source = 'fn test() { say("hello"); }'
      const result = compile(source, { namespace: 'mypack' })
      expect(result.files.length).toBeGreaterThan(0)
      expect(result.ast.namespace).toBe('mypack')
      expect(result.ir.functions.length).toBe(1)
    })

    it('uses default namespace', () => {
      const source = 'fn test() {}'
      const result = compile(source)
      expect(result.ast.namespace).toBe('redscript')
    })

    it('generates correct file structure', () => {
      const source = 'fn test() { say("hello"); }'
      const result = compile(source, { namespace: 'game' })
      
      const paths = result.files.map(f => f.path)
      expect(paths).toContain('pack.mcmeta')
      expect(paths).toContain('data/game/function/load.mcfunction')
      expect(paths.some(p => p.includes('test.mcfunction'))).toBe(true)
    })
  })

  describe('check()', () => {
    it('returns null for valid source', () => {
      const source = 'fn test() { say("hello"); }'
      const error = check(source)
      expect(error).toBeNull()
    })

    it('returns error for invalid source', () => {
      const source = 'fn test( { say("hello"); }'  // Missing )
      const error = check(source)
      expect(error).toBeInstanceOf(Error)
    })

    it('returns error for syntax errors', () => {
      const source = 'fn test() { let x = ; }'  // Missing value
      const error = check(source)
      expect(error).toBeInstanceOf(Error)
    })
  })
})
