import { createServer, type Server, type Socket } from "node:net";
import { concat } from "@std/bytes";
import { encode, tryDecode } from "../src/packet.ts";
import { protocol } from "../src/protocol.ts";
import { setImmediate } from "node:timers";

export interface FakeServerOptions {
  password: string;
  commands?: Record<string, string>;
  fragmentWrites?: boolean;
}

export interface FakeServer {
  port: number;
  close: () => Promise<void>;
}

const MAX_BODY_BYTES = 4096 - 8 - 2; // header + padding overhead per packet

function writeFragmented(socket: Socket, buf: Uint8Array) {
  let i = 0;
  const chunkSize = 2; // deliberately tiny, to maximize fragmentation
  const pump = () => {
    if (socket.destroyed || i >= buf.length) { return; }
    const end = Math.min(i + chunkSize, buf.length);
    socket.write(buf.slice(i, end));
    i = end;
    setImmediate(pump);
  };
  pump();
}

export function startFakeServer(options: FakeServerOptions): Promise<FakeServer> {
  return new Promise((resolve) => {
    const server: Server = createServer((socket) => {
      let buffer = new Uint8Array(0);

      const write = (packet: Uint8Array) => {
        if (options.fragmentWrites) {
          writeFragmented(socket, packet);
        } else {
          socket.write(packet);
        }
      };

      socket.on("data", (chunk: Uint8Array) => {
        buffer = concat([buffer, chunk]);

        while (true) {
          let result;
          try {
            result = tryDecode(buffer);
          } catch {
            socket.destroy();
            return;
          }

          if (result === null) { return; }
          buffer = buffer.slice(result.consumed);

          const packet = result.packet;

          if (packet.type === protocol.SERVERDATA_AUTH) {
            const body = new TextDecoder().decode(packet.body);
            if (body === options.password) {
              write(encode(protocol.SERVERDATA_RESPONSE_VALUE, packet.id, ""));
              write(encode(protocol.SERVERDATA_AUTH_RESPONSE, packet.id, ""));
            } else {
              write(encode(protocol.SERVERDATA_AUTH_RESPONSE, -1, ""));
            }
            continue;
          }

          if (packet.type === protocol.SERVERDATA_EXECCOMMAND) {
            const command = new TextDecoder().decode(packet.body);

            // map is a command that would time out
            if (command === "map") {
              continue;
            }

            const responseBody = options.commands?.[command] ?? "";
            const bodyBytes = new TextEncoder().encode(responseBody);

            if (bodyBytes.length === 0) {
              write(encode(protocol.SERVERDATA_RESPONSE_VALUE, packet.id, ""));
              continue;
            }

            for (let offset = 0; offset < bodyBytes.length; offset += MAX_BODY_BYTES) {
              const slice = bodyBytes.slice(offset, offset + MAX_BODY_BYTES);
              write(
                encode(
                  protocol.SERVERDATA_RESPONSE_VALUE,
                  packet.id,
                  new TextDecoder().decode(slice),
                ),
              );
            }
            continue;
          }

          write(encode(protocol.SERVERDATA_RESPONSE_VALUE, packet.id, "Unknown request"));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;

      resolve({
        port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
