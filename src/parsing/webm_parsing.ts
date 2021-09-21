// TODO WEBM parsing is not yet finished:
// I have no idea of how to recuperate the duration of a segment

import {be2toi, be3toi, be4toi} from "../binary_utils";

const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549A966;
const TIMECODESCALE_ID = 0x2AD7B1;
const CLUSTER_ID = 0x1F43B675;

/**
 * Find the offsets of the value linked to the given element ID.
 * @param {number} elementID - ID for the searched element.
 * @param {Array.<number>} parents - eventual IDs of the parent elements. From
 * top level to lower level (from the furthest to the closest).
 * @param {Uint8Array} buffer - buffer where the ID will be searched
 * @param {Array.<number>} range - start and end offsets in the buffer where the
 * ID will be searched.
 * @returns {Array.<number>|null}
 */
function findNextElement(
  elementID: number,
  parents: number[],
  buffer: Uint8Array,
  [ initialOffset, maxOffset ]: [number, number]
): [number, number]|null {
  let currentOffset = initialOffset;
  while (currentOffset < maxOffset) {
    const parsedID = getEBMLID(buffer, currentOffset);
    if (parsedID == null) {
      return null;
    }

    const { value: ebmlTagID, length: ebmlTagLength } = parsedID;
    const sizeOffset = currentOffset + ebmlTagLength;
    const parsedValue = getEBMLValue(buffer, sizeOffset);
    if (parsedValue == null) {
      return null;
    }

    const { length: valueLengthLength, value: valueLength } = parsedValue;
    const valueOffset = sizeOffset + valueLengthLength;
    const valueEndOffset = valueOffset + valueLength;
    if (ebmlTagID === elementID) {
      return [valueOffset, valueEndOffset];
    } else if (parents.length > 0) {
      for (let i = 0; i < parents.length; i++) {
        if (ebmlTagID === parents[i]) {
          const newParents = parents.slice(i + 1, parents.length);
          return findNextElement(
            elementID, newParents, buffer, [valueOffset, valueEndOffset]);
        }
      }
    }
    currentOffset = valueEndOffset;
  }
  return null;
}

/**
 * Return the timecode scale (basically timescale) of the whole file.
 * @param {Uint8Array} buffer
 * @param {number} initialOffset
 * @returns {number|null}
 */
export function getTimeCodeScale(buffer: Uint8Array, initialOffset: number): number|null {
  const timeCodeScaleOffsets = findNextElement(
    TIMECODESCALE_ID, [SEGMENT_ID, INFO_ID], buffer, [initialOffset, buffer.length]);
  if (timeCodeScaleOffsets == null) {
    return null;
  }
  const length = timeCodeScaleOffsets[1] - timeCodeScaleOffsets[0];
  return 1e9 / bytesToNumber(buffer, timeCodeScaleOffsets[0], length);
}

/**
 * Return the duration of the concerned media.
 * @param {Uint8Array} buffer
 * @param {number} initialOffset
 * @returns {number|null}
 */
// TODO
// function getDuration(buffer, initialOffset) {
//   const durationOffsets = findNextElement(
//     0x9B, [CLUSTER_ID], buffer, [initialOffset, buffer.length]);
//   if (durationOffsets == null) {
//     return null;
//   }

//   // TODO More flexible?
//   const len = durationOffsets[1] - durationOffsets[0];
//   switch (len) {
//     case 4:
//       return be4toi(buffer, durationOffsets[0]);
//     case 3:
//       return be3toi(buffer, durationOffsets[0]);
//     case 2:
//       return be2toi(buffer, durationOffsets[0]);
//     case 1:
//       return buffer[durationOffsets[0]];
//   }
//   return null;
// }

/**
 * Return the duration of the concerned media.
 * @param {Uint8Array} buffer
 * @param {number} initialOffset
 * @returns {number|null}
 */
export function getFirstClusterTimestamp(
  buffer: Uint8Array,
  initialOffset: number
): number|null {
  const timestampOffsets = findNextElement(
    0xE7, [CLUSTER_ID], buffer, [initialOffset, buffer.length]);
  if (timestampOffsets == null) {
    return null;
  }

  const len = timestampOffsets[1] - timestampOffsets[0];
  switch (len) {
    case 4:
      return be4toi(buffer, timestampOffsets[0]);
    case 3:
      return be3toi(buffer, timestampOffsets[0]);
    case 2:
      return be2toi(buffer, timestampOffsets[0]);
    case 1:
      return buffer[timestampOffsets[0]];
    default:
      return bytesToNumber(buffer, timestampOffsets[0], len);
  }
}

function getLength(buffer: Uint8Array, offset: number): number|undefined {
  for (let length = 1; length <= 8; length++) {
    if (buffer[offset] >= Math.pow(2, 8 - length)) {
      return length;
    }
  }
  return undefined;
}

function getEBMLID(
  buffer: Uint8Array,
  offset: number
): { length: number, value: number }|null {
  const length = getLength(buffer, offset);
  if (length == null) {
    console.warn("webm: unrepresentable length");
    return null;
  }
  if (offset + length > buffer.length) {
    console.warn("webm: impossible length");
    return null;
  }

  let value = 0;
  for (let i = 0; i < length; i++) {
    value = buffer[offset + i] * Math.pow(2, (length - i - 1) * 8) + value;
  }
  return { length, value };
}

function getEBMLValue(
  buffer: Uint8Array,
  offset: number
): { length: number, value: number }|null {
  const length = getLength(buffer, offset);
  if (length == null) {
    console.warn("webm: unrepresentable length");
    return null;
  }
  if (offset + length > buffer.length) {
    console.warn("webm: impossible length");
    return null;
  }

  let value = (buffer[offset] & (1 << (8 - length)) - 1) *
    Math.pow(2, (length - 1) * 8);
  for (let i = 1; i < length; i++) {
    value = buffer[offset + i] * Math.pow(2, (length - i - 1) * 8) + value;
  }
  return { length, value };
}

function bytesToNumber(buffer: Uint8Array, offset: number, length: number) {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = buffer[offset + i] * Math.pow(2, (length - i - 1) * 8) + value;
  }
  return value;
}

