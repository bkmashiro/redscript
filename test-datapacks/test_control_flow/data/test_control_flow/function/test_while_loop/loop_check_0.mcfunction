# block: loop_check_0
scoreboard players set $_16 rs 0
execute if score $count rs < $const_3 rs run scoreboard players set $_16 rs 1
execute if score $_16 rs matches 1.. run function test_control_flow:test_while_loop/loop_body_1
execute if score $_16 rs matches ..0 run function test_control_flow:test_while_loop/loop_exit_2