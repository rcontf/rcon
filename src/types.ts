/**
 * The options for creating a new RCON connection
 */
export interface RconOptions {
    /**
     * The IP of the host to connect to
     */
  host: string;

  /**
   * (Optional- Default "27017") The port to connect to
   */
  port?: number;

  /**
   * (Optional- Default "2500") The timeout of the socket to use
   */
  timeout?: number;
}
