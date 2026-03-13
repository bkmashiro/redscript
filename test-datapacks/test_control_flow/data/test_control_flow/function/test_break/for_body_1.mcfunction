# block: for_body_1
scoreboard players set $_13 rs 0
execute if score $i rs = $const_5 rs run scoreboard players set $_13 rs 1
execute if score $_13 rs matches 1.. run function test_control_flow:test_break/then_3
execute if score $_13 rs matches ..0 run function test_control_flow:test_break/merge_5