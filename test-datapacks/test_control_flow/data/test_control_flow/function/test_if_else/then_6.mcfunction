# block: then_6
scoreboard players set $_3 rs 0
execute if score $x rs < $const_20 rs run scoreboard players set $_3 rs 1
execute if score $_3 rs matches 1.. run function test_control_flow:test_if_else/then_9
execute if score $_3 rs matches ..0 run function test_control_flow:test_if_else/merge_11