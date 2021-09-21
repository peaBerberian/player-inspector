/**
 * Return the timecode scale (basically timescale) of the whole file.
 * @param {Uint8Array} buffer
 * @param {number} initialOffset
 * @returns {number|null}
 */
export declare function getTimeCodeScale(buffer: Uint8Array, initialOffset: number): number | null;
/**
 * Return the duration of the concerned media.
 * @param {Uint8Array} buffer
 * @param {number} initialOffset
 * @returns {number|null}
 */
/**
 * Return the duration of the concerned media.
 * @param {Uint8Array} buffer
 * @param {number} initialOffset
 * @returns {number|null}
 */
export declare function getFirstClusterTimestamp(buffer: Uint8Array, initialOffset: number): number | null;
