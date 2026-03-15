scoreboard players add #frame cubedemo_frame 1
execute if score #frame cubedemo_frame matches 60.. run scoreboard players set #frame cubedemo_frame 0
execute as @e[tag=cubedemo_screen,limit=1] at @s run function cubedemo:_render
