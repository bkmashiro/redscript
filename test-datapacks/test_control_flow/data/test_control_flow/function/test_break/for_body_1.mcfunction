# block: for_body_1
scoreboard players set $_26 rs 0
execute if score $i rs = $const_5 rs run scoreboard players set $_26 rs 1
execute if score $_26 rs matches 1.. run function test_control_flow:test_break/then_4
execute if score $_26 rs matches ..0 run function test_control_flow:test_break/merge_6