import { protocol } from "./protocol.ts";
import { concat } from "@std/bytes";
import { createConnection, type Socket } from "node:net";
import { type DecodedPacket, encode, tryDecode } from "./packet.ts";
import { abortable } from "@std/async";
import { NotAuthenticatedException, NotConnectedException, PacketSizeTooBigException, UnableToAuthenicateException } from "./errors.ts";
import type { RconOptions } from "./types.ts";

/**
 * Class that can interact with the [Valve Source RCON Protocol](https://developer.valvesoftware.com/wiki/Source_RCON)
 *
 * RCON connections are made using TCP and responses are always in UTF-8
 *
 * @example Log to console the response
 * ```ts
 * using rcon = new Rcon({ host: "game.example.com", port: 27015 });
 *
 * const didAuthenticate = await rcon.authenticate("myrconpassword");
 *
 * console.log(didAuthenticate ? "Authenticated to the server" : "Could not authenticate");
 *
 * const result = await rcon.execute("status");
 *
 * console.log(result);
 * ```
 *
 * Note the `using` will automatically disconnect and clean up the resources. You can call disconnect manually as well
 */
export class Rcon {
  #host: string;
  #port: number;
  #timeout: number;

  #connection?: Socket;
  #connected = false;
  #authenticated = false;
  #maxPacketSize = 4096;

  #recvBuffer: Uint8Array = new Uint8Array(0);

  #activePacketHandler?: (packet: DecodedPacket) => void;
  #activeReject?: (reason: unknown) => void;

  #queue: Promise<unknown> = Promise.resolve();

  /**
   * Creates a new RCON connection
   * @param {RconOptions} options The connection options
   */
  constructor(options: RconOptions) {
    const { host, port = 27015, timeout = 30_000 } = options;

    this.#host = host;
    this.#port = port;
    this.#timeout = timeout;
  }

  /**
   * Gets whether the socket is connected
   */
  get isConnected(): boolean {
    return this.#connected;
  }

  /**
   * Gets whether the connection is authenticated
   */
  get isAuthenticated(): boolean {
    return this.#authenticated;
  }

  /**
   * Disposes the resources
   */
  [Symbol.dispose]() {
    this.disconnect();
  }

  /**
   * Authenticates the connection
   * @param password The RCON password
   *
   * @returns {Promise<boolean>} The result of the authentication
   */
  public async authenticate(password: string): Promise<boolean> {
    if (!this.#connected) {
      this.#connect();
    }

    // This can only ever be a boolean
    const response = await abortable(
      this.#enqueue(() => this.#send(protocol.SERVERDATA_AUTH, protocol.ID_AUTH, password)).catch(() => false),
      AbortSignal.timeout(this.#timeout),
    ) as boolean;

    this.#authenticated = response;
    return response;
  }

  /**
   * Executes a command on the server
   * @param command The command to execute
   *
   * @returns {Promise<string>} The result of the execution
   */
  public async execute(command: string): Promise<string> {
    if (!this.#connected) {
      throw new NotConnectedException();
    }

    if (!this.#authenticated) {
      throw new NotAuthenticatedException();
    }

    const packetId = Math.floor(Math.random() * (256 - 1) + 1);

    // by this point, the return is only ever a string
    return await abortable(
      this.#enqueue(() => this.#send(protocol.SERVERDATA_EXECCOMMAND, packetId, command)),
      AbortSignal.timeout(this.#timeout),
    ) as string;
  }

  /**
   * Disconnects from the server and resets the authentication status
   */
  public disconnect() {
    this.#authenticated = false;
    this.#connected = false;
    this.#connection?.end();
  }

  /**
   * Connects to the SRCDS server
   */
  #connect() {
    this.#connection = createConnection({
      host: this.#host,
      port: this.#port,
      timeout: 1000,
    });

    this.#connected = true;

    // Registered exactly once per connection. Every byte that arrives gets
    // appended to the running buffer, then we try to peel off as many
    // complete packets as the buffer currently holds - zero, one, or many.
    this.#connection.on("data", (chunk: Uint8Array) => {
      this.#recvBuffer = concat([this.#recvBuffer, chunk]);
      this.#drainPackets();
    });

    const onConnectionDown = (reason: unknown) => {
      this.#connected = false;
      this.#activeReject?.(reason instanceof Error ? reason : new Error(String(reason)));
      this.#activePacketHandler = undefined;
      this.#activeReject = undefined;
    };

    this.#connection.on("error", onConnectionDown);
    this.#connection.on("close", () => onConnectionDown(new NotConnectedException()));
  }

  /**
   * Extracts every complete packet currently sitting in `#recvBuffer` and
   * hands each one to whichever command is currently active.
   */
  #drainPackets() {
    while (true) {
      let result;

      try {
        result = tryDecode(this.#recvBuffer);
      } catch (error) {
        // The stream is corrupt or we've drifted out of sync with packet
        // boundaries - there's no safe way to keep reading from here.
        this.#activeReject?.(error);
        this.#connection?.destroy();
        return;
      }

      if (result === null) {
        // Not enough bytes yet for a full packet - wait for more `data`.
        return;
      }

      this.#recvBuffer = this.#recvBuffer.slice(result.consumed);
      this.#activePacketHandler?.(result.packet);
    }
  }

  /**
   * Runs `task` only after every previously queued command has settled.
   */
  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(task, task);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Writes to socket connection and returns the response from the RCON server
   * @param type Packet Type
   * @param id Packet ID
   * @param body Packet payload
   */
  async #send(type: number, id: number, body: string): Promise<string | boolean> {
    const { promise, resolve, reject } = Promise.withResolvers<string | boolean>();
    const encodedPacket = encode(type, id, body);

    if (this.#maxPacketSize > 0 && encodedPacket.length > this.#maxPacketSize) {
      throw new PacketSizeTooBigException();
    }

    let multiPacketResponse = new Uint8Array();

    this.#activeReject = reject;
    this.#activePacketHandler = (decodedPacket) => {
      if (type === protocol.SERVERDATA_AUTH) {
        if (decodedPacket.id === -1) {
          reject(new UnableToAuthenicateException());
        } else if (decodedPacket.type === protocol.SERVERDATA_AUTH_RESPONSE) {
          resolve(decodedPacket.id === protocol.ID_AUTH);
        }
        // Otherwise this is the empty SERVERDATA_RESPONSE_VALUE the server
        // sends immediately before the real auth response - expected, and
        // ignored.
        return;
      }

      // Because commands are serialized (see `#enqueue`), only packets
      // carrying *this* command's own echoed id, or our own sentinel id,
      // are ever relevant here.
      if (decodedPacket.id !== id && decodedPacket.id !== protocol.ID_TERM) {
        return;
      }

      if (decodedPacket.id === protocol.ID_TERM) {
        // The trash-packet echo: an unambiguous marker that everything
        // gathered so far is the complete response.
        resolve(new TextDecoder().decode(multiPacketResponse));
        return;
      }

      multiPacketResponse = concat([multiPacketResponse, decodedPacket.body]);

      if (decodedPacket.size > 3700) {
        // This packet is close to the protocol's ~4096-byte cap, so the
        // response likely continues in further packets. Send the
        // documented "trash packet" workaround and wait for its echo
        // (id === ID_TERM) rather than guessing when we're done.
        // https://developer.valvesoftware.com/wiki/Talk:Source_RCON_Protocol#How_to_receive_split_response?
        this.#connection!.write(
          encode(protocol.SERVERDATA_RESPONSE_VALUE, protocol.ID_TERM, ""),
        );
      } else {
        // Per protocol, only the *final* packet of a response is allowed
        // to come in under the max size - so it's safe to resolve now and
        // skip the extra sentinel round trip.
        resolve(new TextDecoder().decode(multiPacketResponse));
      }
    };

    this.#connection!.write(encodedPacket);

    return await promise.finally(() => {
      this.#activePacketHandler = undefined;
      this.#activeReject = undefined;
    });
  }
}
