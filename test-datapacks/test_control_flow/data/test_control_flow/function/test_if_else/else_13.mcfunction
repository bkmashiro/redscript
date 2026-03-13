# block: else_13
scoreboard players set $_5 rs 0
execute if score $y rs < $const_75 rs run scoreboard players set $_5 rs 1
execute if score $_5 rs matches 1.. run function test_control_flow:test_if_else/then_15
execute if score $_5 rs matches ..0 run function test_control_flow:test_if_else/else_16