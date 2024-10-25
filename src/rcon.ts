import protocol from "./protocol.ts";
import { Buffer } from "node:buffer";
import { readAll } from "@std/io";
import { encode, decode } from "./packet.ts";
import {
  AlreadyAuthenicatedException,
  NotAuthorizedException,
  PacketSizeTooBigException,
  UnableToAuthenicateException,
} from "./errors.ts";

export interface RconOptions {
  host: string;
  port?: number;
  maxPacketSize?: number;
  timeout?: number;
}

export default class Rcon {
  host: string;
  port: number;
  maxPacketSize: number;
  timeout: number;
  connection!: Deno.Conn;
  connected: boolean;
  authenticated: boolean;

  /**
   * Source RCON (https://developer.valvesoftware.com/wiki/Source_RCON)
   * @param {RconOptions} options Connection options
   */
  constructor(options: RconOptions) {
    this.host = options.host;

    this.port = options.port ?? 27015;
    this.maxPacketSize = options.maxPacketSize ?? 4096;
    this.timeout = options.timeout ?? 2500;

    this.authenticated = false;
    this.connected = false;
  }

  /**
   * Authenticates the connection
   * @param password Password string
   */
  public async authenticate(password: string): Promise<boolean> {
    if (!this.connected) {
      await this.#connect();
    }

    return new Promise((resolve, reject) => {
      if (this.authenticated) {
        reject(new AlreadyAuthenicatedException());
        return;
      }

      this.#write(protocol.SERVERDATA_AUTH, protocol.ID_AUTH, password)
        .then((data) => {
          if (data === true) {
            this.authenticated = true;
            resolve(true);
          } else {
            this.disconnect();
            reject(new UnableToAuthenicateException());
          }
        })
        .catch(reject);
    });
  }

  /**
   * Executes command on the server
   * @param command Command to execute
   */
  public execute(command: string): Promise<string | boolean> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new NotAuthorizedException());
        return;
      }
      const packetId = Math.floor(Math.random() * (256 - 1) + 1);

      if (!this.authenticated) {
        reject(new NotAuthorizedException());
        return;
      }

      this.#write(protocol.SERVERDATA_EXECCOMMAND, packetId, command)
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Creates a connection to the socket
   */
  async #connect(): Promise<void> {
    this.connection = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });
  }

  /**
   * Destroys the socket connection
   */
  public disconnect() {
    this.authenticated = false;
    this.connected = false;
    this.connection.close();
  }

  get isConnected() {
    return this.connected;
  }

  get isAuthenticated() {
    return this.authenticated;
  }

  /**
   * Writes to socket connection
   * @param type Packet Type
   * @param id Packet ID
   * @param body Packet payload
   */
  #write(type: number, id: number, body: string): Promise<string | boolean> {
    // deno-lint-ignore no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let response = "";

      const encodedPacket = encode(type, id, body);

      if (this.maxPacketSize > 0 && encodedPacket.length > this.maxPacketSize) {
        reject(new PacketSizeTooBigException());
        return;
      }

      await this.connection.write(new Uint8Array(encodedPacket));

      const packet = await readAll(this.connection);

      const decodedPacket = decode(Buffer.from(packet));

      // Server will respond twice (0x00 and 0x02) if we send an auth packet (0x03)
      // but we need 0x02 to confirm
      if (
        type === protocol.SERVERDATA_AUTH &&
        decodedPacket.type !== protocol.SERVERDATA_AUTH_RESPONSE
      ) {
        return;
      } else if (
        type === protocol.SERVERDATA_AUTH &&
        decodedPacket.type === protocol.SERVERDATA_AUTH_RESPONSE
      ) {
        if (decodedPacket.id === protocol.ID_AUTH) {
          resolve(true);
        } else {
          resolve(false);
        }
      } else if (
        id === decodedPacket.id ||
        decodedPacket.id === protocol.ID_TERM
      ) {
        if (decodedPacket.id != protocol.ID_TERM) {
          response = response.concat(decodedPacket.body.replace(/\n$/, "\n")); // remove last line break
        }

        // Hack to cope with multipacket responses
        // see https://developer.valvesoftware.com/wiki/Talk:Source_RCON_Protocol#How_to_receive_split_response?
        if (decodedPacket.size > 3700) {
          const encodedTerminationPacket = encode(
            protocol.SERVERDATA_RESPONSE_VALUE,
            protocol.ID_TERM,
            ""
          );

          this.connection.write(new Uint8Array(encodedTerminationPacket));
        } else if (decodedPacket.size <= 3700) {
          // no need to check for ID_TERM here, since this packet will always be < 3700
          resolve(response);
        }
      }
    });
  }
}
