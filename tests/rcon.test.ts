import assert from "node:assert";
import { Rcon } from "../src/rcon.ts";

Deno.test("Rcon can authenticate", async () => {
  using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

  const didAuthenticate = await rcon.authenticate("password");

  assert.equal(didAuthenticate, true);
});

Deno.test({
  name: "Rcon will not authenticate on a bad password",
  ignore: false,
  fn: async () => {
    using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

    const didAuthenticate = await rcon.authenticate("badpassword");

    assert.equal(didAuthenticate, false);
  },
});

Deno.test("Rcon returns the result of the command as a string", async () => {
  using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

  const didAuthenticate = await rcon.authenticate("password");

  assert.equal(didAuthenticate, true);

  const result = await rcon.execute("echo hello");

  assert.equal(result, "hello");
});

Deno.test({
  name: "Rcon successfully returns multi packet responses",
  ignore: true,
  fn: async () => {
    using rcon = new Rcon({ host: "127.0.0.1", port: 27015 });

    const didAuthenticate = await rcon.authenticate("password");

    assert.equal(didAuthenticate, true);

    const result = await rcon.execute("cvarlist");

    await Deno.writeTextFile("test.txt", result, { create: true });

    const expectedResult = await Deno.readTextFile(
      "tests/fixtures/multi-packet-response.txt",
    );

    assert.strictEqual(result, expectedResult);
  },
});
