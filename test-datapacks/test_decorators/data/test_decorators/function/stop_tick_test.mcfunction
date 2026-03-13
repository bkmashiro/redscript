# block: entry
scoreboard players set $tick_test_running rs 0
tellraw @a ["",{"text":"[INFO] @tick test stopped at "},{"score":{"name":"$tick_counter","objective":"rs"}},{"text":" ticks"}]