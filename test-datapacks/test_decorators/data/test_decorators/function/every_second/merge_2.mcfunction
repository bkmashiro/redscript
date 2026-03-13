# block: merge_2
scoreboard players operation $_6 rs = $slow_tick_count rs
scoreboard players operation $_6 rs += $const_1 rs
scoreboard players operation $slow_tick_count rs = $_6 rs
tellraw @a ["",{"text":"[INFO] @tick(rate=20): second #"},{"score":{"name":"$slow_tick_count","objective":"rs"}}]
scoreboard players set $_7 rs 0
execute if score $_6 rs >= $const_5 rs run scoreboard players set $_7 rs 1
execute if score $_7 rs matches 1.. run function test_decorators:every_second/then_3
execute if score $_7 rs matches ..0 run function test_decorators:every_second/merge_5