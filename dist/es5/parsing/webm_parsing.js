// TODO WEBM parsing is not yet finished:
// I have no idea of how to recuperate the duration of a segment
import { be2toi, be3toi, be4toi } from "../binary_utils";
var SEGMENT_ID = 0x18538067;
var INFO_ID = 0x1549A966;
var TIMECODESCALE_ID = 0x2AD7B1;
var CLUSTER_ID = 0x1F43B675;
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
function findNextElement(elementID, parents, buffer, _a) {
    var initialOffset = _a[0], maxOffset = _a[1];
    var currentOffset = initialOffset;
    while (currentOffset < maxOffset) {
        var parsedID = getEBMLID(buffer, currentOffset);
        if (parsedID == null) {
            return null;
        }
        var ebmlTagID = parsedID.value, ebmlTagLength = parsedID.length;
        var sizeOffset = currentOffset + ebmlTagLength;
        var parsedValue = getEBMLValue(buffer, sizeOffset);
        if (parsedValue == null) {
            return null;
        }
        var valueLengthLength = parsedValue.length, valueLength = parsedValue.value;
        var valueOffset = sizeOffset + valueLengthLength;
        var valueEndOffset = valueOffset + valueLength;
        if (ebmlTagID === elementID) {
            return [valueOffset, valueEndOffset];
        }
        else if (parents.length > 0) {
            for (var i = 0; i < parents.length; i++) {
                if (ebmlTagID === parents[i]) {
                    var newParents = parents.slice(i + 1, parents.length);
                    return findNextElement(elementID, newParents, buffer, [valueOffset, valueEndOffset]);
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
export function getTimeCodeScale(buffer, initialOffset) {
    var timeCodeScaleOffsets = findNextElement(TIMECODESCALE_ID, [SEGMENT_ID, INFO_ID], buffer, [initialOffset, buffer.length]);
    if (timeCodeScaleOffsets == null) {
        return null;
    }
    var length = timeCodeScaleOffsets[1] - timeCodeScaleOffsets[0];
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
export function getFirstClusterTimestamp(buffer, initialOffset) {
    var timestampOffsets = findNextElement(0xE7, [CLUSTER_ID], buffer, [initialOffset, buffer.length]);
    if (timestampOffsets == null) {
        return null;
    }
    var len = timestampOffsets[1] - timestampOffsets[0];
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
function getLength(buffer, offset) {
    for (var length_1 = 1; length_1 <= 8; length_1++) {
        if (buffer[offset] >= Math.pow(2, 8 - length_1)) {
            return length_1;
        }
    }
    return undefined;
}
function getEBMLID(buffer, offset) {
    var length = getLength(buffer, offset);
    if (length == null) {
        console.warn("webm: unrepresentable length");
        return null;
    }
    if (offset + length > buffer.length) {
        console.warn("webm: impossible length");
        return null;
    }
    var value = 0;
    for (var i = 0; i < length; i++) {
        value = buffer[offset + i] * Math.pow(2, (length - i - 1) * 8) + value;
    }
    return { length: length, value: value };
}
function getEBMLValue(buffer, offset) {
    var length = getLength(buffer, offset);
    if (length == null) {
        console.warn("webm: unrepresentable length");
        return null;
    }
    if (offset + length > buffer.length) {
        console.warn("webm: impossible length");
        return null;
    }
    var value = (buffer[offset] & (1 << (8 - length)) - 1) *
        Math.pow(2, (length - 1) * 8);
    for (var i = 1; i < length; i++) {
        value = buffer[offset + i] * Math.pow(2, (length - i - 1) * 8) + value;
    }
    return { length: length, value: value };
}
function bytesToNumber(buffer, offset, length) {
    var value = 0;
    for (var i = 0; i < length; i++) {
        value = buffer[offset + i] * Math.pow(2, (length - i - 1) * 8) + value;
    }
    return value;
}
