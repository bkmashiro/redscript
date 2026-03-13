# block: entry
summon minecraft:marker ~ ~1 ~ {Tags:["pos_test"]}
execute as @e[type=minecraft:marker,tag=pos_test] at @s run function test_control_flow:test_foreach_at/foreach_0
say [PASS] foreach at @s: executed at entity position
kill @e[type=marker,tag=pos_test]