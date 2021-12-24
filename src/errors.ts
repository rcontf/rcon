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
    this.message = "Not authorized. Please authenticate first.";
  }
}

export class PacketSizeTooBigException extends Error {
  constructor() {
    super();
    this.message = "Packet size too big";
  }
}

