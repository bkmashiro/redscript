# block: merge_2
scoreboard players set $_38 rs 0
execute if score $a rs > $const_100 rs run scoreboard players set $_38 rs 1
scoreboard players set $_39 rs 0
execute if score $b rs = $const_10 rs run scoreboard players set $_39 rs 1
scoreboard players operation $_40 rs = $_38 rs
execute if score $_40 rs matches ..0 run scoreboard players operation $_40 rs = $_39 rs
execute if score $_40 rs matches 1.. run function test_control_flow:test_complex_conditions/then_3
execute if score $_40 rs matches ..0 run function test_control_flow:test_complex_conditions/else_4