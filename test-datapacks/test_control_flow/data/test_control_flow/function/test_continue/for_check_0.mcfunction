# block: for_check_0
scoreboard players set $_29 rs 0
execute if score $i rs < $const_10 rs run scoreboard players set $_29 rs 1
execute if score $_29 rs matches 1.. run function test_control_flow:test_continue/for_body_1
execute if score $_29 rs matches ..0 run function test_control_flow:test_continue/for_exit_2