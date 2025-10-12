import { protocol } from "./protocol.ts";
import { concat, equals } from "@std/bytes";
import { createConnection, type Socket } from "node:net";
import { decode, encode } from "./packet.ts";
import { abortable } from "@std/async";
import { NotAuthenticatedException, NotConnectedException, PacketSizeTooBigException, UnableToAuthenicateException, UnableToParseResponseException } from "./errors.ts";
import type { RconOptions } from "./types.ts";
import { setTimeout } from "node:timers/promises";

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
      this.#send(protocol.SERVERDATA_AUTH, protocol.ID_AUTH, password),
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
      this.#send(protocol.SERVERDATA_EXECCOMMAND, packetId, command),
      AbortSignal.timeout(this.#timeout),
    ) as string;
  }

  /**
   * Disconnects from the server and resets the authentication status
   */
  public disconnect() {
    this.#authenticated = false;
    this.#connected = false;
    this.#connection?.destroy();
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
  }

  /**
   * Writes to socket connection and returns the response from the RCON server
   * @param type Packet Type
   * @param id Packet ID
   * @param body Packet payload
   */
  // @ts-ignore I know it's right
  async #send(type: number, id: number, body: string): Promise<string | boolean> {
    const { promise, reject, resolve } = Promise.withResolvers<string | boolean>();
    const encodedPacket = encode(type, id, body);

    if (this.#maxPacketSize > 0 && encodedPacket.length > this.#maxPacketSize) {
      throw new PacketSizeTooBigException();
    }

    this.#connection!.write(encodedPacket);

    let hasSentTermPacket = false;
    let potentialMultiPacketResponse = new Uint8Array();

    let i = 0;

    this.#connection!.on("drain", () => console.log("drained"));
    this.#connection!.on("error", () => console.log("error"));
    this.#connection!.on("data", (value) => parse(value));

    const parse = async (value: Uint8Array) => {
      await setTimeout(1000);
      const decodedPacket = decode(value);
      console.log(`packet: ${++i} - size ${decodedPacket.size} `);

      if (decodedPacket.size < 10) {
        reject(new UnableToParseResponseException());
      }

      if (decodedPacket.id === -1) {
        reject(new UnableToAuthenicateException());
      }

      if (decodedPacket.size > this.#maxPacketSize + 200) {
        console.warn("Max size detected");
      }

      const endMarker = new Uint8Array([0x00, 0x01]);
      if (decodedPacket.id === protocol.ID_TERM && equals(decodedPacket.body, endMarker)) {
        console.log("Yo we hit the end");
        resolve(new TextDecoder().decode(potentialMultiPacketResponse));
      }

      if (
        type === protocol.SERVERDATA_AUTH &&
        decodedPacket.type === protocol.SERVERDATA_AUTH_RESPONSE
      ) {
        if (decodedPacket.id === protocol.ID_AUTH) {
          return resolve(true);
        } else {
          return resolve(false);
        }
      } else if (
        type !== protocol.SERVERDATA_AUTH &&
        (decodedPacket.type === protocol.SERVERDATA_RESPONSE_VALUE)
      ) {
        potentialMultiPacketResponse = concat([
          potentialMultiPacketResponse,
          decodedPacket.body,
        ]);

        if (!hasSentTermPacket && decodedPacket.size <= 3700) {
          resolve(new TextDecoder().decode(potentialMultiPacketResponse));
        }

        // Hack to cope with multipacket responses
        // see https://developer.valvesoftware.com/wiki/Talk:Source_RCON_Protocol#How_to_receive_split_response?
        if (decodedPacket.size > 3700 && !hasSentTermPacket) {
          console.info("packet large- lmk when bro");
          hasSentTermPacket = true;
          const encodedTerminationPacket = encode(
            protocol.SERVERDATA_RESPONSE_VALUE,
            protocol.ID_TERM,
            "",
          );

          this.#connection!.write(encodedTerminationPacket);
        }
      }
    };

    return await promise;
  }
}
