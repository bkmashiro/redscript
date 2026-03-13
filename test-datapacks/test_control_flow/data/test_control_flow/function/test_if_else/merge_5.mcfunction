# block: merge_5
scoreboard players set $_2 rs 0
execute if score $x rs > $const_0 rs run scoreboard players set $_2 rs 1
execute if score $_2 rs matches 1.. run function test_control_flow:test_if_else/then_6
execute if score $_2 rs matches ..0 run function test_control_flow:test_if_else/merge_8