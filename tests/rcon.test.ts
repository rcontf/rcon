import assert from "node:assert";
import { Rcon } from "../src/rcon.ts";
import { NotAuthenticatedException, NotConnectedException, PacketSizeTooBigException } from "../src/errors.ts";
import { startFakeServer } from "./fakeSrcdsServer.ts";

const PASSWORD = "correct-password";

Deno.test("authenticate() succeeds with the right password", async () => {
  const fake = await startFakeServer({ password: PASSWORD });
  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port });
    assert.equal(await rcon.authenticate(PASSWORD), true);
    assert.equal(rcon.isAuthenticated, true);
  } finally {
    await fake.close();
  }
});

Deno.test("authenticate() fails with the wrong password", async () => {
  const fake = await startFakeServer({ password: PASSWORD });
  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port });
    assert.equal(await rcon.authenticate("wrong-password"), false);
    assert.equal(rcon.isAuthenticated, false);
  } finally {
    await fake.close();
  }
});

Deno.test("execute() throws NotConnectedException before any connection was made", async () => {
  using rcon = new Rcon({ host: "127.0.0.1", port: 1 });
  await assert.rejects(() => rcon.execute("status"), NotConnectedException);
});

Deno.test("execute() throws NotAuthenticatedException if authenticate() hasn't succeeded", async () => {
  const fake = await startFakeServer({ password: PASSWORD });
  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port });
    await rcon.authenticate("wrong-password"); // fails, but does connect
    await assert.rejects(() => rcon.execute("status"), NotAuthenticatedException);
  } finally {
    await fake.close();
  }
});

Deno.test("execute() returns a short single-packet response correctly", async () => {
  const fake = await startFakeServer({
    password: PASSWORD,
    commands: { "echo hello": "hello" },
  });
  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port });
    await rcon.authenticate(PASSWORD);
    assert.equal(await rcon.execute("echo hello"), "hello");
  } finally {
    await fake.close();
  }
});

Deno.test("execute() throws PacketSizeTooBigException for an oversized command", async () => {
  const fake = await startFakeServer({ password: PASSWORD });
  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port });
    await rcon.authenticate(PASSWORD);

    const hugeCommand = "x".repeat(4090); // encoded length exceeds the 4096-byte cap
    await assert.rejects(() => rcon.execute(hugeCommand), PacketSizeTooBigException);
  } finally {
    await fake.close();
  }
});

Deno.test("works with parallel rcon commands", async () => {
  const fake = await startFakeServer({
    password: PASSWORD,
    commands: {
      cmd1: "response-one",
      cmd2: "response-two",
      cmd3: "response-three",
    },
  });

  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port });
    await rcon.authenticate(PASSWORD);

    // Deliberately not awaited individually - this is exactly the pattern
    // that used to cross-talk when a leftover `data` listener from an
    // earlier command could still consume bytes meant for a later one.
    const [r1, r2, r3] = await Promise.all([
      rcon.execute("cmd1"),
      rcon.execute("cmd2"),
      rcon.execute("cmd3"),
    ]);

    assert.equal(r1, "response-one");
    assert.equal(r2, "response-two");
    assert.equal(r3, "response-three");
  } finally {
    await fake.close();
  }
});

Deno.test("execute() rejects on timeout, and the connection is usable again afterwards", async () => {
  const fake = await startFakeServer({
    password: PASSWORD,
    commands: { "echo hi": "hi" },
  });

  try {
    using rcon = new Rcon({ host: "127.0.0.1", port: fake.port, timeout: 200 });
    await rcon.authenticate(PASSWORD);

    await assert.rejects(async () => await rcon.execute("map"));

    // A timed-out command must not wedge the queue for later commands.
    assert.equal(await rcon.execute("echo hi"), "hi");
  } finally {
    await fake.close();
  }
});
