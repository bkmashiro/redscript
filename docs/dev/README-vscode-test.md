# VSCode Extension Manual Test Guide

The RedScript VSCode extension (`editors/vscode/`) provides syntax highlighting,
code completion, hover documentation, and error diagnostics for `.mcrs` files.
Because the extension runs inside a VS Code host process, automated integration
tests require the `@vscode/test-electron` or `@vscode/test-cli` harness and an
Xvfb display server (or Electron headless mode).  The steps below describe how
to run the manual test cases by hand, plus a scaffold for future automation.

---

## 1. Prerequisites

```bash
cd editors/vscode
npm install
npm run build   # produces out/ from src/
```

Install the extension from VSIX into VS Code:

```bash
code --install-extension redscript-vscode-*.vsix
```

Or open `editors/vscode/` in VS Code and press **F5** to launch an Extension
Development Host.

---

## 2. Test Cases

### 2.1 Syntax Highlighting – `.mcrs` file loaded

**File to open:** any `.mcrs` file, e.g. `examples/hello.mcrs`.

Expected token colourisation (use **Developer: Inspect Editor Tokens and Scopes**):

| Token                  | Expected scope                              |
|------------------------|---------------------------------------------|
| `fn`                   | `keyword.declaration.redscript`             |
| `let`                  | `keyword.declaration.redscript`             |
| `if`, `while`, `return`| `keyword.control.redscript`                 |
| `true`, `false`        | `constant.language.boolean.redscript`       |
| `self`                 | `variable.language.self.redscript`          |
| `int`, `bool`, `string`| `support.type.primitive.redscript`          |
| `@keep`, `@load`       | `meta.decorator.redscript`                  |
| `// comment`           | `comment.line.double-slash.redscript`       |
| `"hello"`              | `string.quoted.double.redscript`            |
| `42`, `3.14`           | `constant.numeric.redscript`                |
| `@p`, `@a`, `@e`       | `entity.name.selector.redscript`            |

**Pass criteria:** every token above shows the expected scope in the inspector.

---

### 2.2 Code Completion – keywords and builtins

1. Create a new file `test.mcrs` with:
   ```redscript
   fn example() {
       sc
   ```
2. Place the cursor after `sc` and press **Ctrl+Space**.

**Expected:** `scoreboard_get`, `scoreboard_set`, `scoreboard_add` appear in the
completion list with their signatures.

3. Type `say(` and hover over it.

**Expected:** completion or IntelliSense shows `say(msg: string)` signature.

4. Type `fn ` at the top level.

**Expected:** snippet for a function declaration is offered.

---

### 2.3 Error Diagnostics – red underline on syntax errors

1. Open or create `test.mcrs` with an intentional error:
   ```redscript
   fn broken() {
       let x: int = ;   // missing right-hand side
   }
   ```
2. Wait ≤ 600 ms (the debounce interval).

**Expected:** the `;` (or the assignment) is underlined in red; the Problems
panel shows an error from the RedScript compiler.

3. Fix the error (`let x: int = 42;`) and save.

**Expected:** the red underline disappears within ~600 ms.

---

### 2.4 Hover Documentation

1. Open any `.mcrs` file that uses a builtin, e.g.:
   ```redscript
   fn t() { scoreboard_set("@s", "score", 10); }
   ```
2. Hover over `scoreboard_set`.

**Expected:** a Markdown hover card appears showing:
- Signature: `scoreboard_set(target, objective, value)`
- Description from the builtin docs table in `src/hover.ts`
- Example usage (if present)

3. Hover over a user-defined function in the same file.

**Expected:** if the function has a `///` doc comment immediately above it,
that comment text appears in the hover.

---

## 3. Automated Test Scaffold (future)

The following test file can be placed at
`editors/vscode/src/test/extension.test.ts` once `@vscode/test-electron` is
added as a dev dependency and a Mocha runner is configured in `package.json`.

```typescript
// editors/vscode/src/test/extension.test.ts
// Automated integration tests for the RedScript VSCode extension.
// Run via: npx @vscode/test-electron --extensionDevelopmentPath=. --extensionTestsPath=./out/test
//
// Requires: @vscode/test-electron, mocha, @types/mocha

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'test.mcrs')

suite('RedScript VSCode Extension', function () {
  this.timeout(10_000)

  let document: vscode.TextDocument

  suiteSetup(async () => {
    // Ensure the extension is activated before tests run.
    await vscode.extensions.getExtension('redscript.redscript-vscode')?.activate()
    document = await vscode.workspace.openTextDocument(FIXTURE)
    await vscode.window.showTextDocument(document)
    // Allow diagnostics to settle (debounce is 600 ms).
    await new Promise(r => setTimeout(r, 800))
  })

  // ── 2.1 Syntax Highlighting ─────────────────────────────────────────────────
  test('grammar is registered for .mcrs files', () => {
    assert.strictEqual(document.languageId, 'redscript')
  })

  // ── 2.2 Completions ─────────────────────────────────────────────────────────
  test('completion list includes scoreboard_set', async () => {
    const pos = new vscode.Position(5, 10)  // after "sc" on line 5
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      pos
    )
    const labels = (list?.items ?? []).map(i =>
      typeof i.label === 'string' ? i.label : i.label.label
    )
    assert.ok(labels.some(l => l.includes('scoreboard_set')), `Expected scoreboard_set in: ${labels.join(', ')}`)
  })

  test('completion list includes keyword "fn"', async () => {
    const pos = new vscode.Position(0, 0)
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      pos
    )
    const labels = (list?.items ?? []).map(i =>
      typeof i.label === 'string' ? i.label : i.label.label
    )
    assert.ok(labels.some(l => l === 'fn'), `Expected "fn" keyword in completions`)
  })

  // ── 2.3 Diagnostics ─────────────────────────────────────────────────────────
  test('no diagnostics on valid file', async () => {
    const diags = vscode.languages.getDiagnostics(document.uri)
    assert.strictEqual(diags.length, 0, `Unexpected diagnostics: ${diags.map(d => d.message).join('; ')}`)
  })

  test('syntax error produces a diagnostic', async () => {
    const edit = new vscode.WorkspaceEdit()
    const errorLine = 'fn broken() { let x: int = ; }\n'
    edit.insert(document.uri, new vscode.Position(document.lineCount, 0), errorLine)
    await vscode.workspace.applyEdit(edit)
    await new Promise(r => setTimeout(r, 800))

    const diags = vscode.languages.getDiagnostics(document.uri)
    assert.ok(diags.length > 0, 'Expected at least one error diagnostic for broken syntax')
  })

  // ── 2.4 Hover ───────────────────────────────────────────────────────────────
  test('hover on scoreboard_set returns documentation', async () => {
    // Position on "scoreboard_set" in the fixture file (line 2, col 4)
    const pos = new vscode.Position(2, 6)
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      pos
    )
    const text = (hovers ?? [])
      .flatMap(h => h.contents)
      .map(c => (typeof c === 'string' ? c : c.value))
      .join('\n')
    assert.ok(text.includes('scoreboard'), `Expected hover docs to mention 'scoreboard', got: ${text}`)
  })
})
```

A matching fixture file (`editors/vscode/fixtures/test.mcrs`):

```redscript
// Fixture for VSCode extension integration tests
fn example() {
    scoreboard_set("@s", "score", 10);
    say("hello");
}

// sc   ← cursor here for completion test (line 5, col 10)
```

---

## 4. Build & Run (CI)

Add to `editors/vscode/package.json` scripts when the automated scaffold is ready:

```json
"test": "node ./out/test/runTests.js"
```

And install:

```bash
npm install --save-dev @vscode/test-electron mocha @types/mocha
```

For headless CI:

```bash
Xvfb :99 -screen 0 1024x768x24 &
DISPLAY=:99 npm test
```
