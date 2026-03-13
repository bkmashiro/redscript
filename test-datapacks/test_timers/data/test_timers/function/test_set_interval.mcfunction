# block: entry
scoreboard players set $interval_count rs 0
say [INFO] setInterval: will fire every 2 seconds...
say [INFO] Run /function test_timers:stop_interval to stop
schedule function test_timers:__interval_0 2000t