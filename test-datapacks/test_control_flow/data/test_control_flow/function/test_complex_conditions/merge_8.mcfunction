# block: merge_8
scoreboard players set $_43 rs 0
execute if score $a rs < $b rs run scoreboard players set $_43 rs 1
scoreboard players set $_44 rs 0
execute if score $b rs < $c rs run scoreboard players set $_44 rs 1
scoreboard players operation $_45 rs = $_43 rs
execute if score $_45 rs matches 1.. run scoreboard players operation $_45 rs = $_44 rs
scoreboard players set $_46 rs 0
execute if score $a rs > $c rs run scoreboard players set $_46 rs 1
scoreboard players operation $_47 rs = $_43 rs
execute if score $_47 rs matches ..0 run scoreboard players operation $_47 rs = $_46 rs
execute if score $_47 rs matches 1.. run function test_control_flow:test_complex_conditions/then_9
execute if score $_47 rs matches ..0 run function test_control_flow:test_complex_conditions/else_10