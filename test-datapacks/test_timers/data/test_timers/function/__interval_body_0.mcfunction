# block: entry
scoreboard players operation $_0 rs = $interval_count rs
scoreboard players operation $_0 rs += $const_1 rs
scoreboard players operation $interval_count rs = $_0 rs
tellraw @a ["",{"text":"[INFO] setInterval tick #"},{"score":{"name":"$interval_count","objective":"rs"}}]