# block: merge_5
scoreboard players set $_4 rs 0
execute if score $tick_counter rs >= $const_100 rs run scoreboard players set $_4 rs 1
execute if score $_4 rs matches 1.. run function test_decorators:on_tick/then_6
execute if score $_4 rs matches ..0 run function test_decorators:on_tick/merge_8