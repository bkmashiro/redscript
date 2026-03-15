kill @e[tag=cubedemo_screen]
execute as @p at @p run summon minecraft:marker ^ ^ ^6 {Tags:["cubedemo_screen"]}
scoreboard players set #frame cubedemo_frame 0
scoreboard players set #on cubedemo_on 1
title @a title [{"text":"RedScript","bold":true,"color":"gold"},{"text":" Cube","color":"white"}]
title @a subtitle [{"text":"software rasterizer · 3D → blocks","color":"gray"}]
tellraw @a [{"text":"▶ cube demo started","color":"green"}]
