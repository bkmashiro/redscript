# block: entry
say [INFO] foreach selector test - spawning markers
summon minecraft:marker ~ ~ ~ {Tags:["test_marker"]}
summon minecraft:marker ~ ~ ~ {Tags:["test_marker"]}
summon minecraft:marker ~ ~ ~ {Tags:["test_marker"]}
scoreboard players set $marker_count rs 0
execute as @e[type=minecraft:marker,tag=test_marker] run function test_control_flow:test_foreach_selector/foreach_0
scoreboard players set $_24 rs 0
execute if score $const_0 rs = $const_3 rs run scoreboard players set $_24 rs 1
execute if score $_24 rs matches 1.. run function test_control_flow:test_foreach_selector/then_0
execute if score $_24 rs matches ..0 run function test_control_flow:test_foreach_selector/else_1