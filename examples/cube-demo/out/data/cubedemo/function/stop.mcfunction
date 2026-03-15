scoreboard players set #on cubedemo_on 0
kill @e[tag=cubedemo_screen]
fill ~-10 ~-8 ~-1 ~10 ~8 ~6 air
tellraw @a [{"text":"■ cube demo stopped","color":"red"}]
