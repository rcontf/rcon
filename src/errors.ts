export class AlreadyAuthenicatedException extends Error {
  constructor() {
    super();
    this.message = "Already authenticated";
  }
}

export class UnableToAuthenicateException extends Error {
  constructor() {
    super();
    this.message = "Unable to authenticate";
  }
}

export class NotAuthorizedException extends Error {
  constructor() {
    super();
    this.message = "Not authenticated";
  }
}

export class NotConnectedException extends Error {
  constructor() {
    super();
    this.message = "Not connected";
  }
}

export class UnableToParseResponseException extends Error {
  constructor() {
    super();
    this.message = "Unable to parse response";
  }
}

export class PacketSizeTooBigException extends Error {
  constructor() {
    super();
    this.message = "Packet size too big";
  }
}
