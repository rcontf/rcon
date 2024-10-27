/**
 * The socket was already authenticated
 */
export class AlreadyAuthenicatedException extends Error {
  constructor() {
    super();
    this.message = "Already authenticated";
  }
}

/**
 * Unable to authenticate the socket
 */
export class UnableToAuthenicateException extends Error {
  constructor() {
    super();
    this.message = "Unable to authenticate";
  }
}

/**
 * Not authenticated to the socket and the user tried to send a command
 */
export class NotAuthenticatedException extends Error {
  constructor() {
    super();
    this.message = "Not authenticated";
  }
}

/**
 * The socket was never connected or disconnected too early
 */
export class NotConnectedException extends Error {
  constructor() {
    super();
    this.message = "Not connected";
  }
}

/**
 * The packet was unable to be parsed into the expected value
 */
export class UnableToParseResponseException extends Error {
  constructor() {
    super();
    this.message = "Unable to parse response";
  }
}

/**
 * The packet being sent is too large to send to the server
 */
export class PacketSizeTooBigException extends Error {
  constructor() {
    super();
    this.message = "Packet size too big";
  }
}
