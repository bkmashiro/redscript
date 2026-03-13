# block: for_exit_2
scoreboard players set $_15 rs 0
execute if score $found rs = $const_5 rs run scoreboard players set $_15 rs 1
execute if score $_15 rs matches 1.. run function test_control_flow:test_break/then_6
execute if score $_15 rs matches ..0 run function test_control_flow:test_break/else_7