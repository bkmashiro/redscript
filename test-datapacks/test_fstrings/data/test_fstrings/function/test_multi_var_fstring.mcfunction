# block: entry
scoreboard players set $a rs 1
scoreboard players set $b rs 2
scoreboard players set $c rs 3
scoreboard players set $_0 rs 1
scoreboard players operation $_0 rs += $const_2 rs
scoreboard players operation $_1 rs = $_0 rs
scoreboard players operation $_1 rs += $const_3 rs
tellraw @a ["",{"text":"[PASS] multi-var: a="},{"score":{"name":"$a","objective":"rs"}},{"text":", b="},{"score":{"name":"$b","objective":"rs"}},{"text":", c="},{"score":{"name":"$c","objective":"rs"}},{"text":", sum="},{"score":{"name":"$_1","objective":"rs"}}]