import { parseArgs } from "@std/cli";
import Rcon from "./src/rcon.ts";

const args = parseArgs(Deno.args, {
  string: ["password", "ip", "port", "command"],
});

if (!args.password || !args.ip || !args.command) {
  console.error("Must specify a password, ip and command");
} else {
  const port = parseInt(args.port ?? "27015", 10);

  const rcon = new Rcon({
    host: args.ip!,
    port,
    timeout: 5000,
  });

  const didAuthenticate = await rcon.authenticate(args.password!);

  console.log(`Authentication status: ${didAuthenticate}`);

  if (didAuthenticate) {
    const result = await rcon.execute(args.command!);

    console.log(result);
  }
}
