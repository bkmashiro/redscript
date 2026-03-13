# block: for_check_0
scoreboard players set $_4 rs 0
execute if score $i rs <= $const_5 rs run scoreboard players set $_4 rs 1
execute if score $_4 rs matches 1.. run function test_control_flow:test_for_loop/for_body_1
execute if score $_4 rs matches ..0 run function test_control_flow:test_for_loop/for_exit_2