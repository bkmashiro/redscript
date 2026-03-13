# block: entry
scoreboard players set $value rs 123
tellraw @a ["",{"text":"[PASS] say f-string: value = "},{"score":{"name":"$value","objective":"rs"}}]
tellraw @a ["",{"text":"[PASS] say f-string: score = "},{"score":{"name":"$score","objective":"rs"}},{"text":", name_test = "},{"score":{"name":"$name_test","objective":"rs"}}]