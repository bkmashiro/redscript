# block: for_body_1
scoreboard players operation $_7 rs = $sum rs
scoreboard players operation $_7 rs += $i rs
scoreboard players operation $sum rs = $_7 rs
scoreboard players operation $_8 rs = $i rs
scoreboard players operation $_8 rs += $const_1 rs
scoreboard players operation $i rs = $_8 rs
function test_control_flow:test_for_loop/for_check_0