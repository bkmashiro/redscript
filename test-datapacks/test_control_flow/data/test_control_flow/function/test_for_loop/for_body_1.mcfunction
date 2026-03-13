# block: for_body_1
scoreboard players operation $_5 rs = $sum rs
scoreboard players operation $_5 rs += $i rs
scoreboard players operation $sum rs = $_5 rs
scoreboard players operation $_6 rs = $i rs
scoreboard players operation $_6 rs += $const_1 rs
scoreboard players operation $i rs = $_6 rs
function test_control_flow:test_for_loop/for_check_0