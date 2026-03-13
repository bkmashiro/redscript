# block: for_exit_3
scoreboard players set $_28 rs 0
execute if score $found rs = $const_5 rs run scoreboard players set $_28 rs 1
execute if score $_28 rs matches 1.. run function test_control_flow:test_break/then_7
execute if score $_28 rs matches ..0 run function test_control_flow:test_break/else_8