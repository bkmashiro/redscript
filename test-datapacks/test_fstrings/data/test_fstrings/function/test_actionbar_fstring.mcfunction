# block: entry
scoreboard players set $health rs 20
title @a actionbar ["",{"text":"HP: "},{"score":{"name":"$health","objective":"rs"}},{"text":" | Score: "},{"score":{"name":"$score","objective":"rs"}}]
say [PASS] actionbar: displayed to all players