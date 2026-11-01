import { compileModules } from '../emit/modules'

const library = {
  name: 'lib', objective: '__abi_lib',
  source: 'module lib; export fn mark(target: selector, label: string): void { tag_add(target, label); }',
}
const application = {
  name: 'app', objective: '__abi_app',
  source: 'module app; import lib::mark; export fn main(): void { mark(@e[tag=chosen], "abi_marked"); }',
}

test.each([false, true])('cross-module callers use the real selector/string macro ABI (reversed=%s)', reversed => {
  const result = compileModules(reversed ? [application, library] : [library, application], {
    namespace: 'abi', entryFunctions: ['app/main'],
  })
  const main = result.files.find(file => file.path.endsWith('/app/main.mcfunction'))!.content
  const callee = result.files.find(file => file.path.endsWith('/lib/mark.mcfunction'))!.content
  expect(callee).toContain('$tag $(target) add $(label)')
  expect(main).toContain('"@e[tag=chosen]"')
  expect(main).toContain('"abi_marked"')
  expect(main).toContain('function abi:lib/mark with storage rs:macro_args')
})
