# block: entry
scoreboard players set $x rs 10
scoreboard players set $_0 rs 0
execute if score $const_10 rs > $const_5 rs run scoreboard players set $_0 rs 1
execute if score $_0 rs matches 1.. run function test_control_flow:test_if_else/then_0
execute if score $_0 rs matches ..0 run function test_control_flow:test_if_else/else_1