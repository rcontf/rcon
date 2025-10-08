# Deno Source RCON Protocol

Complete implementation of the [Source RCON Protocol](https://developer.valvesoftware.com/wiki/Source_RCON_Protocol).

## Install

Checkout the [jsr page](https://jsr.io/@c43721/rcon) for more details.

### Examples

A simple example that connects to a server and executes the `status` command and logs to console

```ts
using rcon = new Rcon({ host: "game.example.com", port: 27015 });

const didAuthenticate = await rcon.authenticate("myrconpassword");

console.log(didAuthenticate ? "Authenticated to the server" : "Could not authenticate");

const result = await rcon.execute("status");

console.log(result);
```

For more examples, see the [documentation on jsr](https://jsr.io/@c43721/rcon/doc) or see the [cli.ts file](cli.ts).

## Contributing

If there's a feature or bug, please raise a github issue first alongside your PR (if you're kind enough to make a PR.)

## Acknowledgements

- EnriqCG's [rcon-srcds](https://github.com/EnriqCG/rcon-srcds)
- ribizli's [deno_rcon](https://github.com/ribizli/deno_rcon)

Both of these repositories I've contributed to in the past and am super thankful for their work.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
