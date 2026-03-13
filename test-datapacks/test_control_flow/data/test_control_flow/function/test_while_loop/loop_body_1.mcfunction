# block: loop_body_1
scoreboard players operation $_17 rs = $count rs
scoreboard players operation $_17 rs += $const_1 rs
scoreboard players operation $count rs = $_17 rs
function test_control_flow:test_while_loop/loop_check_0