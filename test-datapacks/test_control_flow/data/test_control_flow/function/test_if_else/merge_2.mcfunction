# block: merge_2
scoreboard players set $_1 rs 0
execute if score $x rs < $const_5 rs run scoreboard players set $_1 rs 1
execute if score $_1 rs matches 1.. run function test_control_flow:test_if_else/then_3
execute if score $_1 rs matches ..0 run function test_control_flow:test_if_else/else_4