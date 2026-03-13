# block: entry
scoreboard players set $status rs 2
scoreboard players set $_48 rs 0
execute if score $_48 rs matches ..0 if score $status rs matches 0 run function test_control_flow:test_match/match_0
execute if score $_48 rs matches ..0 if score $status rs matches 1 run function test_control_flow:test_match/match_1
execute if score $_48 rs matches ..0 if score $status rs matches 2 run function test_control_flow:test_match/match_2
execute if score $_48 rs matches ..0 run function test_control_flow:test_match/match_3
scoreboard players set $score rs 75
scoreboard players set $_49 rs 0
execute if score $_49 rs matches ..0 if score $score rs matches 0..59 run function test_control_flow:test_match/match_4
execute if score $_49 rs matches ..0 if score $score rs matches 60..69 run function test_control_flow:test_match/match_5
execute if score $_49 rs matches ..0 if score $score rs matches 70..79 run function test_control_flow:test_match/match_6
execute if score $_49 rs matches ..0 if score $score rs matches 80..89 run function test_control_flow:test_match/match_7
execute if score $_49 rs matches ..0 if score $score rs matches 90..100 run function test_control_flow:test_match/match_8
execute if score $_49 rs matches ..0 run function test_control_flow:test_match/match_9