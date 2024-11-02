/**
 * The list of [RCON Packet Types](https://developer.valvesoftware.com/wiki/Source_RCON#Requests_and_Responses)
 *
 * @readonly
 */
export const protocol = {
  /**
   * Used for authenticating the connection with the server
   */
  SERVERDATA_AUTH: 0x03,

  /**
   * Represents a command issue to the server by a client
   */
  SERVERDATA_EXECCOMMAND: 0x02,

  /**
   * Notifies the connection's current authentication status
   *
   * @remarks When sent, the server will respond with an empty {@link SERVERDATA_RESPONSE_VALUE} followed by a {@link SERVERDATA_AUTH_RESPONSE} indicating if the authentication was successful. A value of -1 for the packet id will be set if the authentication failed
   */
  SERVERDATA_AUTH_RESPONSE: 0x02,

  /**
   * Response to a {@link SERVERDATA_EXECCOMMAND}
   */
  SERVERDATA_RESPONSE_VALUE: 0x00,

  /**
   * The packet id used when issuing {@link SERVERDATA_AUTH} commands
   *
   * @internal
   */
  ID_AUTH: 0x999,

  /**
   * The packet id used when working with multipacket responses
   *
   * @internal
   */
  ID_TERM: 0x888,
} as const;
