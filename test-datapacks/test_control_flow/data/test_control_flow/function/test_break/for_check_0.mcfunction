# block: for_check_0
scoreboard players set $_12 rs 0
execute if score $i rs < $const_10 rs run scoreboard players set $_12 rs 1
execute if score $_12 rs matches 1.. run function test_control_flow:test_break/for_body_1
execute if score $_12 rs matches ..0 run function test_control_flow:test_break/for_exit_2