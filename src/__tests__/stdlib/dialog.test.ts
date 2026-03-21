/**
 * Tests for stdlib/dialog.mcrs — MC tellraw dialog system.
 * Verifies compilation succeeds and generated mcfunction contains
 * the correct tellraw/title commands.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const DIALOG_STDLIB = path.join(__dirname, '../../stdlib/dialog.mcrs')
const dialogSrc = fs.readFileSync(DIALOG_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(dialogSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

function getFn(files: { path: string; content: string }[], fnName: string): string {
  const f = files.find(f => f.path.endsWith(`/${fnName}.mcfunction`))
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found. Files:\n${paths}`)
  }
  return f.content
}

describe('stdlib/dialog.mcrs', () => {
  // ── Compilation ────────────────────────────────────────────────────────────

  test('compiles without errors', () => {
    expect(() => {
      const result = compile(dialogSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  // ── dialog_say ─────────────────────────────────────────────────────────────

  test('dialog_say is emitted', () => {
    const files = compileWith(`@keep fn t() { dialog_say(@s, "hello"); }`)
    expect(files.some(f => f.path.includes('dialog_say'))).toBe(true)
  })

  test('dialog_say generates tellraw command', () => {
    const files = compileWith(`@keep fn t() { dialog_say(@s, "hello"); }`)
    const body = getFn(files, 'dialog_say')
    expect(body).toContain('tellraw')
  })

  // ── dialog_broadcast ───────────────────────────────────────────────────────

  test('dialog_broadcast is emitted', () => {
    const files = compileWith(`@keep fn t() { dialog_broadcast("news"); }`)
    expect(files.some(f => f.path.includes('dialog_broadcast'))).toBe(true)
  })

  test('dialog_broadcast targets @a', () => {
    const files = compileWith(`@keep fn t() { dialog_broadcast("news"); }`)
    const body = getFn(files, 'dialog_broadcast')
    expect(body).toContain('@a')
    expect(body).toContain('tellraw')
  })

  // ── dialog_say_color ───────────────────────────────────────────────────────

  test('dialog_say_color is emitted', () => {
    const files = compileWith(`@keep fn t() { dialog_say_color(@s, "hi", 1); }`)
    expect(files.some(f => f.path.includes('dialog_say_color'))).toBe(true)
  })

  test('dialog_say_color generates tellraw with color field', () => {
    const files = compileWith(`@keep fn t() { dialog_say_color(@s, "hi", 1); }`)
    // color branches emit into leaf functions — check across all emitted files
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('tellraw')
    expect(allContent).toContain('color')
  })

  // ── dialog_title ───────────────────────────────────────────────────────────

  test('dialog_title is emitted', () => {
    const files = compileWith(`@keep fn t() { dialog_title(@s, "Welcome", "subtitle here"); }`)
    expect(files.some(f => f.path.includes('dialog_title'))).toBe(true)
  })

  test('dialog_title generates title command', () => {
    const files = compileWith(`@keep fn t() { dialog_title(@s, "Welcome", "subtitle here"); }`)
    const body = getFn(files, 'dialog_title')
    expect(body).toContain('title')
  })

  // ── dialog_title_clear ─────────────────────────────────────────────────────

  test('dialog_title_clear is emitted', () => {
    const files = compileWith(`@keep fn t() { dialog_title_clear(@s); }`)
    expect(files.some(f => f.path.includes('dialog_title_clear'))).toBe(true)
  })

  test('dialog_title_clear generates title clear command', () => {
    const files = compileWith(`@keep fn t() { dialog_title_clear(@s); }`)
    const body = getFn(files, 'dialog_title_clear')
    expect(body).toContain('title')
    expect(body).toContain('clear')
  })

  // ── dialog_actionbar ───────────────────────────────────────────────────────

  test('dialog_actionbar is emitted', () => {
    const files = compileWith(`@keep fn t() { dialog_actionbar(@s, "hotbar msg"); }`)
    expect(files.some(f => f.path.includes('dialog_actionbar'))).toBe(true)
  })

  test('dialog_actionbar generates title actionbar command', () => {
    const files = compileWith(`@keep fn t() { dialog_actionbar(@s, "hotbar msg"); }`)
    const body = getFn(files, 'dialog_actionbar')
    expect(body).toContain('actionbar')
  })

  // ── Combined usage ─────────────────────────────────────────────────────────

  test('multiple dialog calls compile together', () => {
    const files = compileWith(`
      @keep fn greeting(p: selector) {
        dialog_title(p, "Hello", "Welcome back");
        dialog_say_color(p, "You have joined!", 2);
        dialog_actionbar(p, "Ready!");
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
