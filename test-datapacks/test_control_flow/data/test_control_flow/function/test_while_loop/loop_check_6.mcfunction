# block: loop_check_6
scoreboard players set $_19 rs 1
execute if score $_19 rs matches 1.. run function test_control_flow:test_while_loop/loop_body_7
execute if score $_19 rs matches ..0 run function test_control_flow:test_while_loop/loop_exit_8