# block: entry
scoreboard players set $player_count rs 0
execute as @a run function test_control_flow:test_foreach_selector/foreach_0
tellraw @a ["",{"text":"[INFO] foreach: found "},{"score":{"name":"$player_count","objective":"rs"}},{"text":" players"}]