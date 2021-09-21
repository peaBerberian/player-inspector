/**
 * Convert given buffer to a 32bit integer hash
 *
 * This algorithm is the same one that Java `String.hashCode()` one which
 * is a fast hashing function adapted to short ASCII strings.
 * This consequently might not be the most adapted to buffers of various length
 * containing a various amount of data but still has the advantage of being
 * fast.
 *
 * As this function is used in persistent MediaKeySession storage, we probably
 * should keep this function somewhere as long as we want to support
 * MediaKeySessions persisted in old versions of the RxPlayer.
 *
 * @param {Array.<number>|TypedArray} buffer
 * @returns {number}
 */
export function hashBuffer(buffer) {
    var hash = 0;
    var char;
    for (var i = 0; i < buffer.length; i++) {
        char = buffer[i];
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}
export function noop() {
    /* noop */
}
