/**
 * RCON Packet Types
 * Reference: https://developer.valvesoftware.com/wiki/Source_RCON#Requests_and_Responses
 *
 * @readonly
 */
const protocol = {
  /**
   * First packet for authentication
   */
  SERVERDATA_AUTH: 0x03,

  /**
   * Command issued to the server
   */
  SERVERDATA_EXECCOMMAND: 0x02,

  /**
   * Response of SERVERDATA_AUTH
   * @remarks If body is -1, the auth failed
   */
  SERVERDATA_AUTH_RESPONSE: 0x02,

  /**
   * Response of SERVERDATA_EXECCOMMAND
   */
  SERVERDATA_RESPONSE_VALUE: 0x00,

  ID_AUTH: 0x999,

  ID_REQUEST: 0x123,

  ID_TERM: 0x777,
} as const;

export default protocol;
