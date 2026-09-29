import { UnableToParseResponseException } from "./errors.ts";

/**
 * Encodes data to packet buffer
 * @param type Packet Type
 * @param id Packet ID
 * @param body Packet body (payload)
 * @returns Encoded packet buffer
 */
export const encode = (type: number, id: number, body: string): Uint8Array => {
  const dataBuffer = new TextEncoder().encode(body);
  const dataLength = dataBuffer.length;

  const sendBuffer = new Uint8Array(dataLength + 14);
  const view = new DataView(sendBuffer.buffer, sendBuffer.byteOffset, sendBuffer.byteLength);

  view.setInt32(0, dataLength + 10, true);
  view.setInt32(4, id, true);
  view.setInt32(8, type, true);
  // set the text data
  sendBuffer.set(dataBuffer, 12);
  view.setInt16(dataLength + 12, 0, true);

  return sendBuffer;
};

/** Bytes used by the leading `size` field itself (not counted in `size`). */
const SIZE_FIELD_LENGTH = 4;

/** Bytes used by `id` + `type`, which *are* counted in `size`. */
const HEADER_LENGTH = 8;

/** The two trailing NUL bytes (body terminator + empty-string terminator). */
const PADDING_LENGTH = 2;

/**
 * Attempts to decode a single, complete packet from the front of `data`.
 *
 * SRCDS never guarantees that one `data` event from the socket lines up
 * with one packet: a packet can be split across several reads, and several
 * packets can arrive coalesced into a single read. This only ever looks at
 * the `size` prefix to decide whether a full packet is present yet - it
 * never assumes `data` itself is exactly one packet.
 *
 * @param data Accumulated, not-yet-parsed bytes for this connection
 * @returns `null` if `data` doesn't yet contain a full packet (wait for
 *          more), otherwise the decoded packet plus how many bytes of
 *          `data` it consumed so the caller can slice them off
 */
export const tryDecode = (
  data: Uint8Array,
): { packet: DecodedPacket; consumed: number } | null => {
  if (data.byteLength < SIZE_FIELD_LENGTH) {
    return null;
  }

  // IMPORTANT: pass byteOffset/byteLength explicitly. `data` is frequently a
  // *view* into a larger, shared backing ArrayBuffer (Node/Deno reuse buffer
  // pools for socket reads), so `new DataView(data.buffer)` alone would read
  // from the start of that shared buffer instead of the start of `data`.
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const size = view.getInt32(0, true);

  if (size < HEADER_LENGTH + PADDING_LENGTH) {
    // A well-formed packet can never report a size smaller than its own
    // fixed overhead. This is either a corrupt stream or we've drifted out
    // of sync with packet boundaries - surface it rather than reading
    // further garbage as if it were a valid packet.
    throw new UnableToParseResponseException();
  }

  // `size` = HEADER_LENGTH + body length + PADDING_LENGTH (everything after
  // the size field itself). The full packet on the wire is therefore
  // SIZE_FIELD_LENGTH + size bytes long.
  const totalPacketLength = SIZE_FIELD_LENGTH + size;

  if (data.byteLength < totalPacketLength) {
    // The rest of this packet hasn't arrived on the wire yet - wait for
    // more `data` events before attempting to decode it.
    return null;
  }

  const id = view.getInt32(4, true);
  const type = view.getInt32(8, true);
  // Body runs from byte 12 up to (but not including) the 2 trailing NULs.
  const bodyEnd = totalPacketLength - PADDING_LENGTH;
  const body = data.slice(SIZE_FIELD_LENGTH + HEADER_LENGTH, bodyEnd);

  return {
    packet: { size, id, type, body },
    consumed: totalPacketLength,
  };
};

export interface DecodedPacket {
  size: number;
  id: number;
  type: number;
  body: Uint8Array;
}
