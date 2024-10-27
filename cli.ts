import { parseArgs } from "@std/cli";
import Rcon from "./src/rcon.ts";

const args = parseArgs(Deno.args, {
  string: ["password", "ip", "port", "command"],
  boolean: ["console", "file"],
});

if (!args.password || !args.ip || !args.command) {
  console.error("Must specify a password, ip and command");
} else {
  const port = parseInt(args.port ?? "27015", 10);

  using rcon = new Rcon({
    host: args.ip,
    port,
  });

  const didAuthenticate = await rcon.authenticate(args.password!);

  if (didAuthenticate) {
    const result = await rcon.execute(args.command!);

    if (args.file) {
      Deno.writeTextFile(`${Deno.cwd()}/rcon-result.txt`, result.toString(), {
        append: true,
      });
    } else if (args.console) {
      console.log(result);
    }
  } else {
    console.error("RCON password incorrect");
  }
}
