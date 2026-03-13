# RedScript runtime init
scoreboard objectives add rs dummy
scoreboard players set $tick_counter rs 0
scoreboard players set $tick_test_running rs 0
scoreboard players set $slow_tick_count rs 0
scoreboard players set $slow_tick_running rs 0
scoreboard players set $__tick_every_second rs 0
scoreboard players set $const_0 rs 0
scoreboard players set $const_1 rs 1
scoreboard players set $const_20 rs 20
scoreboard players set $const_100 rs 100
scoreboard players set $const_0 rs 0
scoreboard players set $const_1 rs 1
scoreboard players set $const_0 rs 0
scoreboard players set $const_1 rs 1
scoreboard players set $const_5 rs 5
scoreboard players set $const_0 rs 0
scoreboard players set $const_0 rs 0
scoreboard players set $const_1 rs 1
function test_decorators:on_load