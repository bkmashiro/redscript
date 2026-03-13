# block: entry
scoreboard players set $a rs 5
scoreboard players set $b rs 10
scoreboard players set $c rs 15
scoreboard players set $_35 rs 0
execute if score $const_5 rs < $const_10 rs run scoreboard players set $_35 rs 1
scoreboard players set $_36 rs 0
execute if score $const_10 rs < $const_15 rs run scoreboard players set $_36 rs 1
scoreboard players operation $_37 rs = $_35 rs
execute if score $_37 rs matches 1.. run scoreboard players operation $_37 rs = $_36 rs
execute if score $_37 rs matches 1.. run function test_control_flow:test_complex_conditions/then_0
execute if score $_37 rs matches ..0 run function test_control_flow:test_complex_conditions/else_1