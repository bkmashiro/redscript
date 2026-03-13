# block: loop_body_7
scoreboard players operation $_20 rs = $n rs
scoreboard players operation $_20 rs += $const_1 rs
scoreboard players operation $n rs = $_20 rs
scoreboard players set $_21 rs 0
execute if score $_20 rs >= $const_5 rs run scoreboard players set $_21 rs 1
execute if score $_21 rs matches 1.. run function test_control_flow:test_while_loop/then_9
execute if score $_21 rs matches ..0 run function test_control_flow:test_while_loop/merge_11