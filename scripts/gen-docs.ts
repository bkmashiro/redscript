#!/usr/bin/env ts-node
/**
 * gen-docs.ts — RedScript stdlib documentation generator
 *
 * Reads /// doc comments from src/stdlib/*.mcrs files, merges with
 * src/stdlib/i18n/zh.yaml translations, and outputs Markdown files to:
 *   ~/projects/redscript-docs/docs/en/stdlib/<module>.md
 *   ~/projects/redscript-docs/docs/zh/stdlib/<module>.md
 *
 * Usage:
 *   npx ts-node scripts/gen-docs.ts           # generate docs
 *   npx ts-node scripts/gen-docs.ts --check   # check (exit 1 if would change)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// ─── Config ──────────────────────────────────────────────────────────────────

const CHECK_MODE = process.argv.includes('--check');

// --docs-dir <path> overrides the default DOCS_ROOT (useful in CI)
const docsDirIdx = process.argv.indexOf('--docs-dir');
const DOCS_DIR_OVERRIDE = docsDirIdx !== -1 ? process.argv[docsDirIdx + 1] : null;

const STDLIB_DIR = path.join(__dirname, '..', 'src', 'stdlib');
const I18N_ZH    = path.join(STDLIB_DIR, 'i18n', 'zh.yaml');
const DOCS_ROOT  = DOCS_DIR_OVERRIDE
  ? path.resolve(DOCS_DIR_OVERRIDE, 'docs')
  : path.join(process.env.HOME!, 'projects', 'redscript-docs', 'docs');
const EN_OUT     = path.join(DOCS_ROOT, 'en', 'stdlib');
const ZH_OUT     = path.join(DOCS_ROOT, 'zh', 'stdlib');

// Modules to process (filename without .mcrs → output basename)
const TARGET_MODULES = [
  // Core utilities
  'math',
  'vec',
  'strings',
  'result',
  'bits',
  'random',
  // Data structures
  'map',
  'set_int',
  'heap',
  'sort',
  'bigint',
  // Game systems
  'timer',
  'scheduler',
  'state',
  'dialog',
  'ecs',
  'player',
  'effects',
  'combat',
  'physics',
  // MC-specific
  'bossbar',
  'tags',
  'teams',
  'mobs',
  'spawn',
  'world',
  'interactions',
  'inventory',
  'particles',
  // Math / DSP
  'easing',
  'geometry',
  'noise',
  'color',
  'fft',
  'ode',
  'signal',
  'parabola',
  // Linear algebra
  'linalg',
  'matrix',
  'quaternion',
  // Pathfinding / AI
  'graph',
  'pathfind',
  // High-precision math / calculus
  'math_hp',
  'calculus',
  // Advanced algorithms / statistics
  'advanced',
  // Expression evaluator
  'expr',
  // Game utilities
  'cooldown',
  'list',
  'events',
  'sets',
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocComment {
  description: string;
  since?: string;
  deprecated?: string;
  params: { name: string; desc: string }[];
  returns?: string;
  example?: string;
}

interface FnEntry {
  name: string;
  signature: string;       // full fn signature line
  doc: DocComment | null;
  isMethod: boolean;       // true for impl methods
  receiver?: string;       // struct name for methods
  kind: 'fn' | 'const';
}

interface ModuleDoc {
  name: string;
  fns: FnEntry[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseDocComment(lines: string[]): DocComment {
  // lines are raw `/// ...` lines (the `///` already stripped in caller)
  const doc: DocComment = { description: '', params: [] };
  const descLines: string[] = [];
  const exampleLines: string[] = [];
  let inExample = false;

  for (const raw of lines) {
    const line = raw.replace(/^\/\/\/\s?/, '');

    if (line.startsWith('@since')) {
      doc.since = line.replace(/^@since\s+/, '').trim();
      inExample = false;
    } else if (line.startsWith('@deprecated')) {
      doc.deprecated = line.replace(/^@deprecated\s*/, '').trim();
      inExample = false;
    } else if (line.startsWith('@param')) {
      const m = line.match(/^@param\s+(\w+)\s+(.*)/);
      if (m) doc.params.push({ name: m[1], desc: m[2].trim() });
      inExample = false;
    } else if (line.startsWith('@returns') || line.startsWith('@return')) {
      doc.returns = line.replace(/^@returns?\s+/, '').trim();
      inExample = false;
    } else if (line.startsWith('@example')) {
      inExample = true;
    } else if (inExample) {
      exampleLines.push(line);
    } else {
      descLines.push(line);
    }
  }

  doc.description = descLines.join('\n').trim();
  if (exampleLines.length > 0) {
    doc.example = exampleLines.join('\n').trimEnd();
  }
  return doc;
}

function parseModule(src: string, moduleName: string): ModuleDoc {
  const lines = src.split('\n');
  const fns: FnEntry[] = [];

  let docLines: string[] = [];
  let inImpl = false;
  let implName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track impl blocks
    const implMatch = line.match(/^impl\s+(\w+)\s*\{/);
    if (implMatch) {
      inImpl = true;
      implName = implMatch[1];
      continue;
    }
    if (inImpl && line === '}') {
      inImpl = false;
      implName = '';
      continue;
    }

    // Collect doc comment lines
    if (line.trimStart().startsWith('///')) {
      docLines.push(line.trimStart());
      continue;
    }

    // Function declaration
    const fnMatch = line.match(/^\s*(fn\s+\w+(?:<[^>]*>)?\s*\([^)]*\)\s*(?:->|:)\s*[\w<>\[\]]+|fn\s+\w+(?:<[^>]*>)?\s*\([^)]*\)\s*\{|fn\s+\w+(?:<[^>]*>)?\s*\([^)]*\)\s*$)/);

    // Simpler: just look for lines starting with fn (possibly indented inside impl)
    const simpleFnMatch = line.match(/^(\s*)fn\s+(\w+)/);
    if (simpleFnMatch) {
      const fnName = simpleFnMatch[2];
      // Skip private / internal helpers
      if (fnName.startsWith('_') && fnName !== '_math_init') {
        docLines = [];
        continue;
      }

      // Extract full signature: from fn to first {
      let sig = line.trim();
      // If no { on this line, collect continuation lines
      let j = i;
      while (!lines[j].includes('{') && j < i + 5) {
        j++;
        if (j < lines.length) sig += ' ' + lines[j].trim();
      }
      // Trim body: keep only up to first {
      sig = sig.split('{')[0].trim();

      const doc = docLines.length > 0 ? parseDocComment(docLines) : null;
      fns.push({
        name: inImpl ? `${implName}.${fnName}` : fnName,
        signature: sig,
        doc,
        isMethod: inImpl,
        receiver: inImpl ? implName : undefined,
        kind: 'fn',
      });

      docLines = [];
      continue;
    }

    // Constant declaration
    const simpleConstMatch = line.match(/^(\s*)const\s+(\w+)/);
    if (simpleConstMatch) {
      const constName = simpleConstMatch[2];
      const doc = docLines.length > 0 ? parseDocComment(docLines) : null;
      fns.push({
        name: constName,
        signature: line.trim(),
        doc,
        isMethod: false,
        receiver: undefined,
        kind: 'const',
      });

      docLines = [];
      continue;
    }

    // Non-doc, non-fn line → reset doc accumulator
    if (!line.trimStart().startsWith('//')) {
      // Only reset if it's not blank
      if (line.trim() !== '') {
        docLines = [];
      }
    } else {
      // Regular // comment — reset
      docLines = [];
    }
  }

  return { name: moduleName, fns };
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function badge(text: string, color: string): string {
  // Simple inline badge using shields.io style text
  return `\`${text}\``;
}

function renderEnDoc(modDoc: ModuleDoc): string {
  const lines: string[] = [];
  const title = modDoc.name.charAt(0).toUpperCase() + modDoc.name.slice(1);

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> Auto-generated from \`src/stdlib/${modDoc.name}.mcrs\` — do not edit manually.`);
  lines.push('');

  // Table of contents
  const withDoc = modDoc.fns.filter(f => f.doc);
  if (withDoc.length > 0) {
    lines.push('## API');
    lines.push('');
    for (const fn of withDoc) {
      const anchor = fn.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      lines.push(`- [${fn.name}](#${anchor})`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const fn of modDoc.fns) {
    if (!fn.doc) continue;
    const doc = fn.doc;
    const anchor = fn.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Build title with optional badges
    let titleLine = `## \`${fn.name}\``;
    if (doc.since) {
      titleLine += ` <Badge type="info" text="v${doc.since}" />`;
    }
    if (doc.deprecated) {
      titleLine += ` <Badge type="danger" text="Deprecated" />`;
    }
    lines.push(titleLine);
    lines.push('');

    if (doc.deprecated) {
      lines.push(`> ⚠️ **Deprecated:** ${doc.deprecated}`);
      lines.push('');
    }

    if (doc.description) {
      lines.push(doc.description);
      lines.push('');
    }

    // Signature
    lines.push('```redscript');
    lines.push(fn.signature);
    lines.push('```');
    lines.push('');

    // Parameters table
    if (doc.params.length > 0) {
      lines.push('**Parameters**');
      lines.push('');
      lines.push('| Parameter | Description |');
      lines.push('|-----------|-------------|');
      for (const p of doc.params) {
        lines.push(`| \`${p.name}\` | ${p.desc} |`);
      }
      lines.push('');
    }

    // Returns
    if (doc.returns) {
      lines.push(`**Returns:** ${doc.returns}`);
      lines.push('');
    }

    // Example
    if (doc.example) {
      lines.push('**Example**');
      lines.push('');
      lines.push('```redscript');
      lines.push(doc.example);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function renderZhDoc(modDoc: ModuleDoc, zh: Record<string, any>): string {
  const modZh = zh[modDoc.name] || {};
  const lines: string[] = [];
  const title = modDoc.name.charAt(0).toUpperCase() + modDoc.name.slice(1);

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> 本文档由 \`src/stdlib/${modDoc.name}.mcrs\` 自动生成，请勿手动编辑。`);
  lines.push('');

  const withDoc = modDoc.fns.filter(f => f.doc);
  if (withDoc.length > 0) {
    lines.push('## API 列表');
    lines.push('');
    for (const fn of withDoc) {
      const anchor = fn.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      lines.push(`- [${fn.name}](#${anchor})`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const fn of modDoc.fns) {
    if (!fn.doc) continue;
    const doc = fn.doc;

    // Look up zh translation: prefer fn.name key, fallback to base name
    const zhEntry = modZh[fn.name] || modZh[fn.name.split('.').pop()!] || {};

    // Build title with optional badges
    let titleLine = `## \`${fn.name}\``;
    if (doc.since) {
      titleLine += ` <Badge type="info" text="v${doc.since}" />`;
    }
    if (doc.deprecated) {
      titleLine += ` <Badge type="danger" text="Deprecated" />`;
    }
    lines.push(titleLine);
    lines.push('');

    if (doc.deprecated) {
      lines.push(`> ⚠️ **已废弃：** ${doc.deprecated}`);
      lines.push('');
    }

    // Description: zh override or en fallback
    const desc = zhEntry.desc || doc.description;
    if (desc) {
      lines.push(desc);
      lines.push('');
    }

    // Signature
    lines.push('```redscript');
    lines.push(fn.signature);
    lines.push('```');
    lines.push('');

    // Parameters table
    if (doc.params.length > 0) {
      lines.push('**参数**');
      lines.push('');
      lines.push('| 参数 | 说明 |');
      lines.push('|------|------|');
      for (const p of doc.params) {
        const zhDesc = zhEntry.params?.[p.name] || p.desc;
        lines.push(`| \`${p.name}\` | ${zhDesc} |`);
      }
      lines.push('');
    }

    // Returns
    const returns = zhEntry.returns || doc.returns;
    if (returns) {
      lines.push(`**返回：** ${returns}`);
      lines.push('');
    }

    // Example (always in code, no translation needed)
    if (doc.example) {
      lines.push('**示例**');
      lines.push('');
      lines.push('```redscript');
      lines.push(doc.example);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log(`gen-docs: mode=${CHECK_MODE ? 'check' : 'generate'}`);

  // Load zh translations
  let zh: Record<string, any> = {};
  if (fs.existsSync(I18N_ZH)) {
    const raw = fs.readFileSync(I18N_ZH, 'utf8');
    zh = yaml.parse(raw) || {};
  } else {
    console.warn(`Warning: ${I18N_ZH} not found — zh docs will use en text`);
  }

  // Ensure output dirs exist
  if (!CHECK_MODE) {
    fs.mkdirSync(EN_OUT, { recursive: true });
    fs.mkdirSync(ZH_OUT, { recursive: true });
  }

  let changed = false;
  let processed = 0;

  for (const mod of TARGET_MODULES) {
    const srcFile = path.join(STDLIB_DIR, `${mod}.mcrs`);
    if (!fs.existsSync(srcFile)) {
      console.warn(`Warning: ${srcFile} not found — skipping`);
      continue;
    }

    const src = fs.readFileSync(srcFile, 'utf8');
    const modDoc = parseModule(src, mod);

    const enMd = renderEnDoc(modDoc);
    const zhMd = renderZhDoc(modDoc, zh);

    const enOut = path.join(EN_OUT, `${mod}.md`);
    const zhOut = path.join(ZH_OUT, `${mod}.md`);

    for (const [outPath, content] of [[enOut, enMd], [zhOut, zhMd]] as [string, string][]) {
      const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
      if (existing !== content) {
        changed = true;
        if (!CHECK_MODE) {
          fs.writeFileSync(outPath, content, 'utf8');
          console.log(`  wrote: ${outPath}`);
        } else {
          console.log(`  would update: ${outPath}`);
        }
      } else {
        console.log(`  unchanged: ${outPath}`);
      }
    }

    const docCount = modDoc.fns.filter(f => f.doc).length;
    console.log(`  ${mod}: ${modDoc.fns.length} entries, ${docCount} documented`);
    processed++;
  }

  console.log(`\nProcessed ${processed} module(s).`);

  if (CHECK_MODE && changed) {
    console.error('check: docs are out of date — run gen-docs.ts to regenerate');
    process.exit(1);
  }

  if (!CHECK_MODE && !changed) {
    console.log('All docs up to date.');
  }
}

main();
