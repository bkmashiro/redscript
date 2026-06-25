export type Brand<T, K extends string> = T & { readonly __brand: K }

export type ModuleId = Brand<number, 'ModuleId'>
export type FuncId = Brand<number, 'FuncId'>
export type BlockId = Brand<number, 'BlockId'>
export type OpId = Brand<number, 'OpId'>
export type ValueId = Brand<number, 'ValueId'>
export type TypeId = Brand<number, 'TypeId'>
export type LocId = Brand<number, 'LocId'>
