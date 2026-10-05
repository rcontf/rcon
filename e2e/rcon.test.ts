import assert from "node:assert";
import { Rcon } from "../src/rcon.ts";

Deno.test("Rcon can authenticate", async () => {
  using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

  const didAuthenticate = await rcon.authenticate("password");

  assert.equal(didAuthenticate, true);
});

Deno.test("Rcon returns the result of the command as a string", async () => {
  using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

  const didAuthenticate = await rcon.authenticate("password");

  assert.equal(didAuthenticate, true);

  const result = await rcon.execute("echo hello");

  assert.equal(result, "hello \n");
});

Deno.test("Rcon successfully returns multi packet responses", async () => {
  using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

  const didAuthenticate = await rcon.authenticate("password");

  assert.equal(didAuthenticate, true);

  const result = await rcon.execute("cvarlist");

  const expectedResult = await Deno.readTextFile(
    "e2e/fixtures/multi-packet-response.txt",
  );

  assert.equal(2037, result.split("\n").length);
  assert.strictEqual(result, expectedResult);
});
