import { encode } from "../src/packet.ts";

Deno.bench("creating a packet", { baseline: true }, () => {
  encode(0x22, 10, "say hello");
});
