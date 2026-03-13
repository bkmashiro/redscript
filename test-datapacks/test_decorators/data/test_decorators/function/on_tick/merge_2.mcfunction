# block: merge_2
scoreboard players operation $_1 rs = $tick_counter rs
scoreboard players operation $_1 rs += $const_1 rs
scoreboard players operation $tick_counter rs = $_1 rs
scoreboard players operation $_2 rs = $_1 rs
scoreboard players operation $_2 rs %= $const_20 rs
scoreboard players set $_3 rs 0
execute if score $_2 rs = $const_0 rs run scoreboard players set $_3 rs 1
execute if score $_3 rs matches 1.. run function test_decorators:on_tick/then_3
execute if score $_3 rs matches ..0 run function test_decorators:on_tick/merge_5