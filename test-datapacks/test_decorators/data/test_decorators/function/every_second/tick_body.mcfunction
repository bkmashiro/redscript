# block: tick_body
scoreboard players set $__tick_every_second rs 0
scoreboard players set $_5 rs 0
execute if score $slow_tick_running rs = $const_0 rs run scoreboard players set $_5 rs 1
execute if score $_5 rs matches 1.. run function test_decorators:every_second/then_0
execute if score $_5 rs matches ..0 run function test_decorators:every_second/merge_2