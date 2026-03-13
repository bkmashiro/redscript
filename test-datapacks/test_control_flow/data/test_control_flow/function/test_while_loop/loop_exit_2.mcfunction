# block: loop_exit_2
scoreboard players set $_10 rs 0
execute if score $count rs = $const_3 rs run scoreboard players set $_10 rs 1
execute if score $_10 rs matches 1.. run function test_control_flow:test_while_loop/then_3
execute if score $_10 rs matches ..0 run function test_control_flow:test_while_loop/else_4