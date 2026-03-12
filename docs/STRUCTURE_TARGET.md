# Structure Target

`--target structure` emits a Minecraft structure file (`.nbt`) containing command blocks loaded with the compiled output. This is useful when you want to place the compiler output directly in-world with a Structure Block or `/place structure`, instead of copying loose command blocks by hand.

## Workflow

Compile a source file into a raw structure NBT:

```bash
redscript compile --target structure src/examples/arena.rs -o arena.nbt
```

Then copy the generated file into your datapack's `structures/` folder, for example:

```text
world/datapacks/my_pack/structures/arena.nbt
```

After reloading the datapack, place it in-game:

```mcfunction
/place structure my_pack:arena ~ ~ ~
```

You can also preview and load the same file with a Structure Block.

## Layout

Each non-comment, non-blank line from each generated `.mcfunction` file becomes one command block. Blocks are laid out eastward, then wrapped row-by-row in a snake-friendly grid with a maximum width of 16.

```text
Layer Y=0

[0,0,0] [1,0,0] [2,0,0] ... [15,0,0]
[0,0,1] [1,0,1] [2,0,1] ... [15,0,1]
[0,0,2] [1,0,2] [2,0,2] ... [15,0,2]
```

Palette usage:

- Impulse command block: first command in a non-tick function
- Chain command block: subsequent commands in the same function
- Repeating command block: first command in `__tick`, with `auto: 1b`

## Limitations

- Minecraft structures are practical only up to roughly 32k placed blocks before they become awkward to manage.
- Individual command block commands are still limited to 32767 characters.
- The structure target serializes command blocks only; it does not gzip the output.
