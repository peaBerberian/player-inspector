/**
 * Translate groups of 2 big-endian bytes to Integer (from 0 up to 65535).
 * @param {Uint8Array} bytes
 * @param {Number} offset - The offset (from the start of the given array)
 * @returns {Number}
 */
export function be2toi(bytes, offset) {
    return ((bytes[offset + 0] << 8) +
        (bytes[offset + 1] << 0));
}
/**
 * Translate groups of 3 big-endian bytes to Integer.
 * @param {Uint8Array} bytes
 * @param {Number} offset - The offset (from the start of the given array)
 * @returns {Number}
 */
export function be3toi(bytes, offset) {
    return ((bytes[offset + 0] * 0x0010000) +
        (bytes[offset + 1] * 0x0000100) +
        (bytes[offset + 2]));
}
/**
 * Translate groups of 4 big-endian bytes to Integer.
 * @param {Uint8Array} bytes
 * @param {Number} offset - The offset (from the start of the given array)
 * @returns {Number}
 */
export function be4toi(bytes, offset) {
    return ((bytes[offset + 0] * 0x1000000) +
        (bytes[offset + 1] * 0x0010000) +
        (bytes[offset + 2] * 0x0000100) +
        (bytes[offset + 3]));
}
/**
 * Translate groups of 8 big-endian bytes to Integer.
 * @param {Uint8Array} bytes
 * @param {Number} offset - The offset (from the start of the given array)
 * @returns {Number}
 */
export function be8toi(bytes, offset) {
    return (((bytes[offset + 0] * 0x1000000) +
        (bytes[offset + 1] * 0x0010000) +
        (bytes[offset + 2] * 0x0000100) +
        (bytes[offset + 3])) * 0x100000000 +
        (bytes[offset + 4] * 0x1000000) +
        (bytes[offset + 5] * 0x0010000) +
        (bytes[offset + 6] * 0x0000100) +
        (bytes[offset + 7]));
}
