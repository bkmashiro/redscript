# block: for_exit_3
scoreboard players set $_34 rs 0
execute if score $sum rs = $const_20 rs run scoreboard players set $_34 rs 1
execute if score $_34 rs matches 1.. run function test_control_flow:test_continue/then_7
execute if score $_34 rs matches ..0 run function test_control_flow:test_continue/else_8