# deploy-demo

Compile and deploy the readme demo to the local test server.

```bash
node dist/cli.js compile examples/readme-demo.mcrs \
    -o ~/mc-test-server/world/datapacks/rsdemo \
    --namespace rsdemo
```

Then in-game: `/reload` → `/function rsdemo:start`
Stand ~10 blocks back, face forward.
