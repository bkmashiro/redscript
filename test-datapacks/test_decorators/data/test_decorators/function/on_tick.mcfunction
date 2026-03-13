# block: entry
scoreboard players set $_0 rs 0
execute if score $tick_test_running rs = $const_0 rs run scoreboard players set $_0 rs 1
execute if score $_0 rs matches 1.. run function test_decorators:on_tick/then_0
execute if score $_0 rs matches ..0 run function test_decorators:on_tick/merge_2