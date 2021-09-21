export declare function isISOBMFFInitSegment(buffer: ArrayBuffer): boolean;
export declare function isISOBMFFMediaSegment(buffer: ArrayBuffer): boolean;
/**
 * Parse track Fragment Decode Time to get a precize initial time for this
 * segment (in the media timescale).
 *
 * Stops at the first tfdt encountered from the beginning of the file.
 * Returns this time.
 * `undefined` if not found.
 * @param {Uint8Array} buffer
 * @returns {Number | undefined}
 */
export declare function getTrackFragmentDecodeTime(buffer: Uint8Array): number | undefined;
/**
 * Returns TRAF Box from the whole ISOBMFF File.
 * Returns null if not found.
 * @param {Uint8Array} buffer
 * @returns {Uint8Array|null}
 */
export declare function getTRAF(buffer: Uint8Array): Uint8Array | null;
/**
 * Get timescale information from a movie header box. Found in init segments.
 * `undefined` if not found or not parsed.
 *
 * This timescale is the default timescale used for segments.
 * @param {Uint8Array} buffer
 * @returns {Number | undefined}
 */
export declare function getMDHDTimescale(buffer: Uint8Array): number | undefined;
/**
 * @param {Uint8Array} buffer
 * @returns {Array.<number>}
 */
export declare function getWidthAndHeight(buf: Uint8Array): [number, number] | null;
/**
 * Calculate segment duration approximation by additioning the duration from
 * every samples in a trun ISOBMFF box.
 *
 * Returns `undefined` if we could not parse the duration.
 * @param {Uint8Array} buffer
 * @returns {number | undefined}
 */
export declare function getDurationFromTrun(buffer: Uint8Array): number | undefined;
export declare function getDurationFromSegmentSidx(buffer: Uint8Array): number | undefined;
