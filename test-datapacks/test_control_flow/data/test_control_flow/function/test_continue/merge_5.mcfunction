# block: merge_5
scoreboard players operation $_32 rs = $sum rs
scoreboard players operation $_32 rs += $i rs
scoreboard players operation $sum rs = $_32 rs
scoreboard players operation $_33 rs = $i rs
scoreboard players operation $_33 rs += $const_1 rs
scoreboard players operation $i rs = $_33 rs
function test_control_flow:test_continue/for_check_0