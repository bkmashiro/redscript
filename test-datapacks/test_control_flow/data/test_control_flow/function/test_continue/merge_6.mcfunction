# block: merge_6
scoreboard players operation $_32 rs = $sum rs
scoreboard players operation $_32 rs += $i rs
scoreboard players operation $sum rs = $_32 rs
function test_control_flow:test_continue/for_continue_2