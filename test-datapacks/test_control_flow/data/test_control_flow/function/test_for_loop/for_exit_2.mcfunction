# block: for_exit_2
scoreboard players set $_9 rs 0
execute if score $sum rs = $const_15 rs run scoreboard players set $_9 rs 1
execute if score $_9 rs matches 1.. run function test_control_flow:test_for_loop/then_3
execute if score $_9 rs matches ..0 run function test_control_flow:test_for_loop/else_4