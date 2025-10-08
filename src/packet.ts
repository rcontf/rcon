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
  const view = new DataView(sendBuffer.buffer);

  view.setInt32(0, dataLength + 10, true);
  view.setInt32(4, id, true);
  view.setInt32(8, type, true);
  // set the text data
  sendBuffer.set(dataBuffer, 12);
  view.setInt16(dataLength + 12, 0, true);

  return sendBuffer;
};

/**
 * Decodes packet buffer to data
 * @param buf Buffer to decode
 * @param encoding Body encoding
 * @returns Decoded packet object
 */
export const decode = (data: Uint8Array): DecodedPacket => {
  const dataView = new DataView(data.buffer);

  const size = dataView.getInt32(0, true);
  const id = dataView.getInt32(4, true);
  const type = dataView.getInt32(8, true);
  const payload = data.slice(12, size);

  return {
    size,
    id,
    type,
    body: payload,
  };
};

interface DecodedPacket {
  size: number;
  id: number;
  type: number;
  body: Uint8Array;
}
