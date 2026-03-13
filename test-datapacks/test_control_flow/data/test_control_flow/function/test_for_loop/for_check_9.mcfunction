# block: for_check_9
scoreboard players set $_11 rs 0
execute if score $b rs <= $const_3 rs run scoreboard players set $_11 rs 1
execute if score $_11 rs matches 1.. run function test_control_flow:test_for_loop/for_body_10
execute if score $_11 rs matches ..0 run function test_control_flow:test_for_loop/for_exit_11