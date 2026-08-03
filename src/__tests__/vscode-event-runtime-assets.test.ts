import * as fs from 'fs'
import * as path from 'path'

const repoRoot = path.resolve(__dirname, '../..')
const canonicalAsset = path.join(repoRoot, 'src/stdlib/events.mcrs')
const packagedAsset = path.join(repoRoot, 'editors/vscode/runtime-assets/src/stdlib/events.mcrs')
const extensionBundle = path.join(repoRoot, 'editors/vscode/out/extension.js')
const lspBundle = path.join(repoRoot, 'editors/vscode/out/lsp-server.js')
const zhStdlibDocs = path.join(repoRoot, 'src/stdlib/i18n/zh.yaml')

describe('VS Code event runtime packaging', () => {
  test('ships the canonical event runtime beside the fallback compiler bundle', () => {
    expect(fs.readFileSync(packagedAsset)).toEqual(fs.readFileSync(canonicalAsset))

    const extension = fs.readFileSync(extensionBundle, 'utf-8')
    expect(extension).toContain('../runtime-assets')
    expect(extension).toContain('runtimeAssets: ["src/stdlib/events.mcrs"]')
  })

  test('keeps both editor bundles on the supported three-event manifest', () => {
    for (const bundlePath of [extensionBundle, lspBundle]) {
      const bundle = fs.readFileSync(bundlePath, 'utf-8')
      expect(bundle).toContain('name: "PlayerJoin"')
      expect(bundle).toContain('name: "PlayerDeath"')
      expect(bundle).toContain('name: "EntityKill"')
      expect(bundle).not.toContain('ItemUse')
      expect(bundle).not.toContain('BlockBreak')
      expect(bundle).not.toContain('on_item_use')
      expect(bundle).not.toContain('on_block_break')
    }
  })

  test('does not advertise the removed event in stdlib documentation metadata', () => {
    const zhDocs = fs.readFileSync(zhStdlibDocs, 'utf-8')
    expect(zhDocs).not.toContain('rs.item_use')
    expect(zhDocs).not.toContain('物品使用事件')
    expect(zhDocs).toContain('rs.deaths/rs.kills/rs.left/rs.events')
  })
})
