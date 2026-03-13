# block: merge_5
scoreboard players set $_41 rs 0
execute if score $a rs > $b rs run scoreboard players set $_41 rs 1
scoreboard players set $_42 rs 0
execute if score $_41 rs = $const_0 rs run scoreboard players set $_42 rs 1
execute if score $_42 rs matches 1.. run function test_control_flow:test_complex_conditions/then_6
execute if score $_42 rs matches ..0 run function test_control_flow:test_complex_conditions/else_7