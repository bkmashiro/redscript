# block: for_check_7
scoreboard players set $_10 rs 0
execute if score $a rs <= $const_2 rs run scoreboard players set $_10 rs 1
execute if score $_10 rs matches 1.. run function test_control_flow:test_for_loop/for_body_8
execute if score $_10 rs matches ..0 run function test_control_flow:test_for_loop/for_exit_10