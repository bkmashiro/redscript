# block: entry
scoreboard players add $__tick_every_second rs 1
execute store success score $__tick_every_second_check rs if score $__tick_every_second rs matches 20..
execute if score $__tick_every_second_check rs matches 1.. run function test_decorators:every_second/tick_body
execute if score $__tick_every_second_check rs matches ..0 run function test_decorators:every_second/tick_skip