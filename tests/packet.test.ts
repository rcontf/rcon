import assert from "node:assert";
import { encode, tryDecode } from "../src/packet.ts";
import { UnableToParseResponseException } from "../src/errors.ts";

Deno.test("can encode a packet", () => {
  const wire = encode(0x02, 42, "hello world");
  const result = tryDecode(wire);

  assert.ok(result !== null);
  assert.equal(result.packet.id, 42);
  assert.equal(result.packet.type, 0x02);
  assert.equal(new TextDecoder().decode(result.packet.body), "hello world");
  assert.equal(result.consumed, wire.byteLength);
});

Deno.test("tryDecode does not truncate the last bytes of the body", () => {
  const wire = encode(0x00, 1, "hello");
  const result = tryDecode(wire);

  assert.ok(result !== null);
  assert.equal(new TextDecoder().decode(result.packet.body), "hello");
});

Deno.test("tryDecode returns null when fewer than 4 bytes are available", () => {
  assert.equal(tryDecode(new Uint8Array([])), null);
  assert.equal(tryDecode(new Uint8Array([1, 2, 3])), null);
});

Deno.test("tryDecode returns null when the size prefix is present but the body hasn't fully arrived", () => {
  const wire = encode(0x00, 1, "a fairly long body to make sure we're really only partial here");
  // Only the first half of the packet has "arrived".
  const partial = wire.slice(0, Math.floor(wire.byteLength / 2));

  assert.equal(tryDecode(partial), null);
});

Deno.test("tryDecode consumes exactly one packet and leaves the remainder untouched", () => {
  // Two packets coalesced into a single buffer, as can happen when the
  // OS delivers several writes in one `data` event.
  const first = encode(0x00, 1, "first");
  const second = encode(0x00, 2, "second");
  const combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(first, 0);
  combined.set(second, first.byteLength);

  const firstResult = tryDecode(combined);
  assert.ok(firstResult !== null);
  assert.equal(firstResult.packet.id, 1);
  assert.equal(firstResult.consumed, first.byteLength);

  const remainder = combined.slice(firstResult.consumed);
  const secondResult = tryDecode(remainder);
  assert.ok(secondResult !== null);
  assert.equal(secondResult.packet.id, 2);
  assert.equal(new TextDecoder().decode(secondResult.packet.body), "second");
});

Deno.test("tryDecode works when the buffer is a view with a nonzero byteOffset", () => {
  const wire = encode(0x00, 7, "offset test");

  const padded = new Uint8Array(wire.byteLength + 31);
  padded.set(wire, 31);
  const view = padded.subarray(31); // byteOffset === 31 into `padded.buffer`

  const result = tryDecode(view);
  assert.ok(result !== null);
  assert.equal(result.packet.id, 7);
  assert.equal(new TextDecoder().decode(result.packet.body), "offset test");
});

Deno.test("tryDecode throws UnableToParseResponseException on an impossible size field", () => {
  const bogus = new Uint8Array(20);
  new DataView(bogus.buffer).setInt32(0, 1, true); // smaller than the 10-byte minimum overhead

  assert.throws(() => tryDecode(bogus), UnableToParseResponseException);
});

Deno.test("products a correct packet", () => {
  const wire = encode(0x02, 99, "ab");
  const view = new DataView(wire.buffer);

  assert.equal(view.getInt32(0, true), 10 + 2); // header(8) + body(2) + padding(2)
  assert.equal(view.getInt32(4, true), 99);
  assert.equal(view.getInt32(8, true), 0x02);
  assert.equal(wire[12], "a".charCodeAt(0));
  assert.equal(wire[13], "b".charCodeAt(0));
  assert.equal(wire[14], 0); // body NUL terminator
  assert.equal(wire[15], 0); // empty-string terminator
  assert.equal(wire.byteLength, 16);
});
