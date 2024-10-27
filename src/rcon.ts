import protocol from "./protocol.ts";
import { iterateReader } from "@std/io";
import { concat } from "@std/bytes";
import { encode, decode } from "./packet.ts";
import {
  AlreadyAuthenicatedException,
  NotAuthorizedException,
  PacketSizeTooBigException,
  UnableToAuthenicateException,
} from "./errors.ts";
import type { RconOptions } from "./types.ts";

/**
 * Class that can interact with the [Value Source RCON Protocol](https://developer.valvesoftware.com/wiki/Source_RCON)
 */
export default class Rcon {
  host: string;
  port: number;
  timeout: number;

  #connection?: Deno.Conn;
  #connected = false;
  #authenticated = false;
  #maxPacketSize = 4096;

  /**
   * Creates a new RCON connection
   * @param {RconOptions} options Connection options
   */
  constructor(options: RconOptions) {
    const { host, port = 27015, timeout = 2500 } = options;

    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  get isConnected() {
    return this.#connected;
  }

  get isAuthenticated() {
    return this.#authenticated;
  }

  /**
   * Authenticates the connection
   * @param password Password string
   */
  public async authenticate(password: string): Promise<boolean> {
    if (!this.#connected) {
      await this.#connect();
    }

    if (this.#authenticated) {
      throw new AlreadyAuthenicatedException();
    }

    const response = await this.#send(
      protocol.SERVERDATA_AUTH,
      protocol.ID_AUTH,
      password
    );

    if (response === true) {
      this.#authenticated = true;
      return true;
    } else {
      this.disconnect();
      throw new UnableToAuthenicateException();
    }
  }

  /**
   * Executes command on the server
   * @param command Command to execute
   */
  public async execute(command: string) {
    if (!this.#connected) {
      throw new NotAuthorizedException();
    }

    const packetId = Math.floor(Math.random() * (256 - 1) + 1);

    if (!this.#authenticated) {
      throw new NotAuthorizedException();
    }

    return await this.#send(protocol.SERVERDATA_EXECCOMMAND, packetId, command);
  }

  /**
   * Creates a connection to the socket
   */
  async #connect() {
    this.#connection = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });

    this.#connected = true;
  }

  /**
   * Destroys the socket connection
   */
  public disconnect() {
    this.#authenticated = false;
    this.#connected = false;
    this.#connection?.close();
  }

  /**
   * Writes to socket connection and returns the response from the RCON server
   * @param type Packet Type
   * @param id Packet ID
   * @param body Packet payload
   */
  async #send(type: number, id: number, body: string) {
    const encodedPacket = encode(type, id, body);

    if (this.#maxPacketSize > 0 && encodedPacket.length > this.#maxPacketSize) {
      throw new PacketSizeTooBigException();
    }

    await this.#connection!.write(encodedPacket);

    let potentialMultiPacketResponse = new Uint8Array();

    for await (const response of iterateReader(this.#connection!)) {
      const decodedPacket = decode(response);

      if (decodedPacket.size < 10) {
        throw new Error("failed to decode packet");
      }

      if (decodedPacket.id === -1) {
        throw new UnableToAuthenicateException();
      }

      if (
        type === protocol.SERVERDATA_AUTH &&
        decodedPacket.type === protocol.SERVERDATA_AUTH_RESPONSE
      ) {
        if (decodedPacket.id === protocol.ID_AUTH) {
          return true;
        } else {
          return false;
        }
      } else if (
        type !== protocol.SERVERDATA_AUTH &&
        (decodedPacket.type === protocol.SERVERDATA_RESPONSE_VALUE ||
          decodedPacket.id === protocol.ID_TERM)
      ) {
        // concat a multipacket response
        if (decodedPacket.id != protocol.ID_TERM) {
          potentialMultiPacketResponse = concat([
            potentialMultiPacketResponse,
            new TextEncoder().encode(decodedPacket.body),
          ]);
        }

        // Hack to cope with multipacket responses
        // see https://developer.valvesoftware.com/wiki/Talk:Source_RCON_Protocol#How_to_receive_split_response?
        if (decodedPacket.size > 3700) {
          const encodedTerminationPacket = encode(
            protocol.SERVERDATA_RESPONSE_VALUE,
            protocol.ID_TERM,
            ""
          );

          await this.#connection!.write(encodedTerminationPacket);
        } else if (decodedPacket.size <= 3700) {
          // no need to check for ID_TERM here, since this packet will always be < 3700
          return new TextDecoder().decode(potentialMultiPacketResponse);
        }
      }
    }

    throw new Error("Unreachable");
  }
}
