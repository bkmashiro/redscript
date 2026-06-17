/**
 * Tests for the RedScript test framework (runner.test.ts)
 *
 * Covers:
 * - @test decorator parsing
 * - assert builtin compilation output
 * - test runner command arguments
 * - dry-run mode output
 * - harness contract helpers and response parsing
 * - offline harness protocol execution behavior
 */

import * as http from 'http'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import {
  parseTestFunctions,
  dryRunTests,
  normalizeHarnessBaseUrl,
  buildHarnessRunPayload,
  buildFailedCountRequest,
  parseScoreValue,
  runTests,
} from '../../testing/runner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// 1. @test decorator parsing
// ---------------------------------------------------------------------------

describe('@test decorator parsing', () => {
  test('parses single @test function with label', () => {
    const source = `
      @test("加法基本测试")
      fn test_add(): void {
        let result: int = 1 + 2;
      }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(1)
    expect(tests[0].fnName).toBe('test_add')
    expect(tests[0].label).toBe('加法基本测试')
  })

  test('parses multiple @test functions', () => {
    const source = `
      @test("first test")
      fn test_one(): void { }

      @test("second test")
      fn test_two(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(2)
    expect(tests[0].label).toBe('first test')
    expect(tests[1].label).toBe('second test')
  })

  test('returns empty array when no @test functions', () => {
    const source = `
      fn normal_fn(): void { }

      @load
      fn on_load(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(0)
  })

  test('@test without label defaults to empty string', () => {
    const source = `
      @test("")
      fn test_no_label(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(1)
    expect(tests[0].label).toBe('')
  })

  test('only @test functions are returned, not @load/@tick', () => {
    const source = `
      @load
      fn on_load(): void { }

      @test("my test")
      fn test_thing(): void { }

      fn helper(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(1)
    expect(tests[0].fnName).toBe('test_thing')
  })
})

// ---------------------------------------------------------------------------
// 2. assert builtin compilation output
// ---------------------------------------------------------------------------

describe('assert builtin compilation', () => {
  test('assert compiles without errors', () => {
    const source = `
      @keep
      fn test_assert(): void {
        let x: int = 1;
        assert(x == 1);
      }
    `
    expect(() => compile(source, { namespace: 'test' })).not.toThrow()
  })

  test('assert emits execute unless score run tellraw on false branch', () => {
    const source = `
      @keep
      fn test_assert(): void {
        let x: int = 1;
        assert(x == 1);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test_assert.mcfunction')
    expect(fn).toBeDefined()
    // Should contain execute unless score ... matches 1 run tellraw
    expect(fn).toMatch(/execute unless score .+ matches 1 run tellraw @a/)
  })

  test('assert emits scoreboard add for rs.test_failed counter', () => {
    const source = `
      @keep
      fn test_assert(): void {
        let x: int = 2;
        assert(x == 2);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test_assert.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('rs.test_failed')
    expect(fn).toContain('rs.meta')
  })

  test('assert with boolean expression compiles correctly', () => {
    const source = `
      @keep
      fn test_bool_assert(): void {
        let a: int = 5;
        let b: int = 5;
        assert(a == b);
      }
    `
    expect(() => compile(source, { namespace: 'test' })).not.toThrow()
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test_bool_assert.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toMatch(/execute unless score .+ matches 1 run tellraw @a/)
  })
})

// ---------------------------------------------------------------------------
// 3. Test runner command arguments / dry-run mode
// ---------------------------------------------------------------------------

describe('dry-run mode', () => {
  test('dryRunTests returns ok:true for valid test source', () => {
    const source = `
      @test("basic test")
      fn test_basic(): void {
        let x: int = 1;
        assert(x == 1);
      }
    `
    const tests = parseTestFunctions(source)
    const result = dryRunTests(source, 'test.mcrs', 'test', tests)
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  test('dryRunTests returns ok:false for invalid source', () => {
    // Source with a type error
    const source = `
      @test("bad test")
      fn test_bad(): void {
        let x: string = 42;
        assert(x == "hello");
      }
    `
    const tests = parseTestFunctions(source)
    const result = dryRunTests(source, 'test.mcrs', 'test', tests)
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  test('dryRunTests with multiple tests returns ok when all valid', () => {
    const source = `
      @test("test one")
      fn test_one(): void {
        let a: int = 1;
        assert(a == 1);
      }

      @test("test two")
      fn test_two(): void {
        let b: int = 2;
        assert(b == 2);
      }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(2)
    const result = dryRunTests(source, 'test.mcrs', 'test', tests)
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Harness contract and response parsing helpers (offline)
// ---------------------------------------------------------------------------

describe('harness contract helpers', () => {
  test('normalizeHarnessBaseUrl strips trailing slash', () => {
    expect(normalizeHarnessBaseUrl('http://localhost:25561/')).toBe('http://localhost:25561')
    expect(normalizeHarnessBaseUrl('https://localhost:25561///')).toBe('https://localhost:25561')
    expect(normalizeHarnessBaseUrl('https://localhost:25561')).toBe('https://localhost:25561')
  })

  test('buildHarnessRunPayload emits primary command payload by default', () => {
    expect(JSON.parse(buildHarnessRunPayload('arena'))).toEqual({
      cmd: 'function arena:__run_all_tests',
    })
  })

  test('buildHarnessRunPayload emits legacy command payload', () => {
    expect(JSON.parse(buildHarnessRunPayload('arena', 'legacy'))).toEqual({
      command: 'function arena:__run_all_tests',
    })
  })

  test('buildFailedCountRequest emits primary GET scoreboard URL', () => {
    expect(buildFailedCountRequest('http://localhost:25561/', 'primary')).toEqual({
      url: 'http://localhost:25561/scoreboard?player=rs.test_failed&obj=rs.meta',
      method: 'GET',
      body: undefined,
    })
  })

  test('buildFailedCountRequest emits legacy POST scoreboard payload', () => {
    expect(buildFailedCountRequest('http://localhost:25561', 'legacy')).toEqual({
      url: 'http://localhost:25561/score',
      method: 'POST',
      body: JSON.stringify({ objective: 'rs.meta', player: 'rs.test_failed' }),
    })
  })
})

describe('score value parsing', () => {
  test('parseScoreValue parses top-level primitives', () => {
    expect(parseScoreValue('5')).toBe(5)
  })

  test('parseScoreValue parses common object variants', () => {
    expect(parseScoreValue('{ "value": 3 }')).toBe(3)
    expect(parseScoreValue('{ "result": { "value": "4" } }')).toBe(4)
    expect(parseScoreValue('{ "result": { "value": { "value": "9" } } }')).toBe(9)
  })

  test('parseScoreValue scans arrays and nested response variants', () => {
    expect(parseScoreValue('[{ "ok": true }, { "result": "7" }]')).toBe(7)
  })

  test('parseScoreValue throws on malformed payload shape', () => {
    expect(() => parseScoreValue('{ "status": "ok" }')).toThrow('Unexpected scoreboard response')
  })

  test('parseScoreValue throws when JSON is not parseable', () => {
    expect(() => parseScoreValue('not json')).toThrow('Invalid scoreboard response JSON')
  })
})

// ---------------------------------------------------------------------------
// 5. Offline protocol execution behavior (fake harness server)
// ---------------------------------------------------------------------------

type RequestRecord = {
  method: string
  url: string
  body: string
}

function startFakeHarnessServer(handlers: {
  command?: { status: number; body?: string }
  run?: { status: number; body?: string }
  scoreboard?: { status: number; body?: string }
  score?: { status: number; body?: string }
}) {
  const requests: RequestRecord[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString()
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body,
      })

      const route = req.url?.split('?')[0] ?? ''
      if (route === '/command' && handlers.command) {
        res.statusCode = handlers.command.status
        res.end(handlers.command.body ?? '')
        return
      }
      if (route === '/run' && handlers.run) {
        res.statusCode = handlers.run.status
        res.end(handlers.run.body ?? '')
        return
      }
      if (route === '/scoreboard' && handlers.scoreboard) {
        res.statusCode = handlers.scoreboard.status
        res.end(handlers.scoreboard.body ?? '')
        return
      }
      if (route === '/score' && handlers.score) {
        res.statusCode = handlers.score.status
        res.end(handlers.score.body ?? '')
        return
      }

      res.statusCode = 404
      res.end('{}')
    })
  })

  return new Promise<{ server: http.Server; requests: RequestRecord[]; port: number }>((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind fake harness server'))
        return
      }
      resolve({ server, requests, port: address.port })
    })
  })
}

function createTempSourceFile(source: string, namespace = 'runnersuite') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${namespace}-`))
  const srcPath = path.join(dir, `${namespace}.mcrs`)
  fs.writeFileSync(srcPath, source, 'utf-8')
  const outDir = path.join(dir, 'dist')
  return { dir, srcPath, outDir }
}

describe('offline harness protocol execution', () => {
  const source = `
    @test("passes")
    fn test_pass(): void {
      let x: int = 1;
      assert(x == 1);
    }
  `

  test('runTests prefers primary /command + /scoreboard when both succeed', async () => {
    const { server, requests, port } = await startFakeHarnessServer({
      command: { status: 200 },
      scoreboard: { status: 200, body: JSON.stringify({ value: 0 }) },
      run: { status: 200 },
      score: { status: 200, body: JSON.stringify({ value: 0 }) },
    })

    const { srcPath, outDir, dir } = createTempSourceFile(source)
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      await runTests({
        filePath: srcPath,
        mcUrl: `http://127.0.0.1:${port}`,
        outputDir: outDir,
      })

      expect(requests.map(r => r.url)).toEqual([
        '/command',
        '/scoreboard?player=rs.test_failed&obj=rs.meta',
      ])
      expect(requests.find(r => r.url.startsWith('/run'))).toBeUndefined()
      expect(requests.find(r => r.url === '/score')).toBeUndefined()
      expect(exitSpy).not.toHaveBeenCalled()

      const commandRequest = requests.find(r => r.url === '/command')
      expect(commandRequest?.method).toBe('POST')
      expect(JSON.parse(commandRequest?.body ?? '{}')).toEqual({ cmd: 'function runnersuite:__run_all_tests' })

      const scoreboardRequest = requests.find(r => r.url.startsWith('/scoreboard'))
      expect(scoreboardRequest?.method).toBe('GET')
    } finally {
      exitSpy.mockRestore()
      server.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('runTests falls back to legacy /run + /score when primary endpoints fail', async () => {
    const { server, requests, port } = await startFakeHarnessServer({
      command: { status: 500, body: 'primary command failed' },
      scoreboard: { status: 503, body: 'primary scoreboard failed' },
      run: { status: 200 },
      score: { status: 200, body: JSON.stringify({ value: 0 }) },
    })

    const { srcPath, outDir, dir } = createTempSourceFile(source, 'runnersuite2')
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      await runTests({
        filePath: srcPath,
        mcUrl: `http://127.0.0.1:${port}`,
        outputDir: outDir,
      })

      expect(requests.map(r => r.url)).toContain('/command')
      expect(requests.map(r => r.url)).toContain('/score')
      expect(requests.map(r => r.url)).toContain('/run')
      expect(requests.map(r => r.url)).toContain('/scoreboard?player=rs.test_failed&obj=rs.meta')
      expect(exitSpy).not.toHaveBeenCalled()

      const runRequest = requests.find(r => r.url === '/run')
      expect(runRequest?.method).toBe('POST')
      expect(JSON.parse(runRequest?.body ?? '{}')).toEqual({ command: 'function runnersuite2:__run_all_tests' })

      const scoreRequest = requests.find(r => r.url === '/score')
      expect(scoreRequest?.method).toBe('POST')
      expect(JSON.parse(scoreRequest?.body ?? '{}')).toEqual({
        objective: 'rs.meta',
        player: 'rs.test_failed',
      })
    } finally {
      exitSpy.mockRestore()
      server.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
