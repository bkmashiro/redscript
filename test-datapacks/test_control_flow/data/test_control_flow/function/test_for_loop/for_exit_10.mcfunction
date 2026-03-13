# block: for_exit_10
scoreboard players set $_15 rs 0
execute if score $product rs = $const_6 rs run scoreboard players set $_15 rs 1
execute if score $_15 rs matches 1.. run function test_control_flow:test_for_loop/then_15
execute if score $_15 rs matches ..0 run function test_control_flow:test_for_loop/else_16