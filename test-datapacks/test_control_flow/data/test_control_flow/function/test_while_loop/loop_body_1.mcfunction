# block: loop_body_1
scoreboard players operation $_9 rs = $count rs
scoreboard players operation $_9 rs += $const_1 rs
scoreboard players operation $count rs = $_9 rs
function test_control_flow:test_while_loop/loop_check_0