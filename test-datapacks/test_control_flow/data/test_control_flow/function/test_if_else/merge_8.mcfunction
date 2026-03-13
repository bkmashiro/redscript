# block: merge_8
scoreboard players set $y rs 50
scoreboard players set $_4 rs 0
execute if score $const_50 rs < $const_25 rs run scoreboard players set $_4 rs 1
execute if score $_4 rs matches 1.. run function test_control_flow:test_if_else/then_12
execute if score $_4 rs matches ..0 run function test_control_flow:test_if_else/else_13