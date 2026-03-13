# block: loop_exit_8
scoreboard players set $_22 rs 0
execute if score $n rs = $const_5 rs run scoreboard players set $_22 rs 1
execute if score $_22 rs matches 1.. run function test_control_flow:test_while_loop/then_12
execute if score $_22 rs matches ..0 run function test_control_flow:test_while_loop/else_13