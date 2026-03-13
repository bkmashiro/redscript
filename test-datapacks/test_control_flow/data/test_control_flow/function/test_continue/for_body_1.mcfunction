# block: for_body_1
scoreboard players operation $_30 rs = $i rs
scoreboard players operation $_30 rs %= $const_2 rs
scoreboard players set $_31 rs 0
execute unless score $_30 rs = $const_0 rs run scoreboard players set $_31 rs 1
execute if score $_31 rs matches 1.. run function test_control_flow:test_continue/then_3
execute if score $_31 rs matches ..0 run function test_control_flow:test_continue/merge_5