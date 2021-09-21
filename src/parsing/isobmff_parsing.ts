import {be2toi, be3toi, be4toi, be8toi} from "../binary_utils";

const stypHex = 0x73747970;
const ftypHex = 0x66747970;
const moofHex = 0x6D6F6F66;
const moovHex = 0x6D6F6F76;

export function isISOBMFFInitSegment(buffer: ArrayBuffer): boolean {
  const firstBox = new DataView(buffer).getUint32(4);
  return firstBox === moovHex || firstBox === ftypHex;
}

export function isISOBMFFMediaSegment(buffer: ArrayBuffer): boolean {
  const firstBox = new DataView(buffer).getUint32(4);
  return firstBox === moofHex || firstBox === stypHex;
}

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
export function getTrackFragmentDecodeTime(buffer: Uint8Array): number | undefined {
  const traf = getTRAF(buffer);
  if (traf === null) {
    return undefined;
  }
  const tfdt = getBoxContent(traf, 0x74666474 /* tfdt */);
  if (tfdt === null) {
    return undefined;
  }
  const version = tfdt[0];
  return version === 1 ? be8toi(tfdt, 4) :
         version === 0 ? be4toi(tfdt, 4) :
                         undefined;
}

/**
 * Returns TRAF Box from the whole ISOBMFF File.
 * Returns null if not found.
 * @param {Uint8Array} buffer
 * @returns {Uint8Array|null}
 */
export function getTRAF(buffer: Uint8Array): Uint8Array | null {
  const moof = getBoxContent(buffer, 0x6D6F6F66 /* moof */);
  if (moof === null) {
    return null;
  }
  return getBoxContent(moof, 0x74726166 /* traf */);
}

/**
 * Returns the content of a box based on its name.
 * `null` if not found.
 * @param {Uint8Array} buf - the isobmff structure
 * @param {Number} boxName - the 4-letter 'name' of the box as a 4 bit integer
 * generated from encoding the corresponding ASCII in big endian.
 * @returns {UInt8Array|null}
 */
function getBoxContent(buf: Uint8Array, boxName: number): Uint8Array|null {
  const offsets = getBoxOffsets(buf, boxName);
  return offsets !== null ? buf.subarray(offsets[1], offsets[2]) :
                            null;
}

/**
 * Returns byte offsets for the start of the box, the start of its content and
 * the end of the box (not inclusive).
 *
 * `null` if not found.
 *
 * If found, the tuple returned has three elements, all numbers:
 *   1. The starting byte corresponding to the start of the box (from its size)
 *   2. The beginning of the box content - meaning the first byte after the
 *      size and the name of the box.
 *   3. The first byte after the end of the box, might be equal to `buf`'s
 *      length if we're considering the last box.
 * @param {Uint8Array} buf - the isobmff structure
 * @param {Number} boxName - the 4-letter 'name' of the box as a 4 bit integer
 * generated from encoding the corresponding ASCII in big endian.
 * @returns {Array.<number>|null}
 */
function getBoxOffsets(
  buf: Uint8Array,
  boxName: number
): [number, number, number]|null {
  const len = buf.length;

  let boxBaseOffset = 0;
  let name;
  let lastBoxSize = 0;
  let lastOffset;
  while (boxBaseOffset + 8 <= len) {
    lastOffset = boxBaseOffset;
    lastBoxSize = be4toi(buf, lastOffset);
    lastOffset += 4;

    name = be4toi(buf, lastOffset);
    lastOffset += 4;

    if (lastBoxSize === 0) {
      lastBoxSize = len - boxBaseOffset;
    } else if (lastBoxSize === 1) {
      if (lastOffset + 8 > len) {
        return null;
      }
      lastBoxSize = be8toi(buf, lastOffset);
      lastOffset += 8;
    }

    if (lastBoxSize < 0) {
      throw new Error("ISOBMFF: Size out of range");
    }
    if (name === boxName) {
      if (boxName === 0x75756964 /* === "uuid" */) {
        lastOffset += 16; // Skip uuid name
      }
      return [boxBaseOffset, lastOffset, boxBaseOffset + lastBoxSize];
    } else {
      boxBaseOffset += lastBoxSize;
    }
  }
  return null;
}

/**
 * Get timescale information from a movie header box. Found in init segments.
 * `undefined` if not found or not parsed.
 *
 * This timescale is the default timescale used for segments.
 * @param {Uint8Array} buffer
 * @returns {Number | undefined}
 */
export function getMDHDTimescale(buffer: Uint8Array): number|undefined {
  const mdia = getMDIA(buffer);
  if (mdia === null) {
    return undefined;
  }

  const mdhd = getBoxContent(mdia, 0x6D646864 /* "mdhd" */);
  if (mdhd === null) {
    return undefined;
  }

  let cursor = 0;
  const version = mdhd[cursor]; cursor += 4;
  return version === 1 ? be4toi(mdhd, cursor + 16) :
         version === 0 ? be4toi(mdhd, cursor + 8) :
                         undefined;
}

/**
 * Returns MDIA Box from the whole ISOBMFF File.
 * Returns null if not found.
 * @param {Uint8Array} buffer
 * @returns {Uint8Array|null}
 */
function getMDIA(buf: Uint8Array): Uint8Array|null {
  const moov = getBoxContent(buf, 0x6D6F6F76 /* moov */);
  if (moov === null) {
    return null;
  }

  const trak = getBoxContent(moov, 0x7472616B /* "trak" */);
  if (trak === null) {
    return null;
  }

  return getBoxContent(trak, 0x6D646961 /* "mdia" */);
}

/**
 * @param {Uint8Array} buffer
 * @returns {Array.<number>}
 */
export function getWidthAndHeight(
  buf: Uint8Array
): [number, number]|null {
  const moov = getBoxContent(buf, 0x6D6F6F76 /* moov */);
  if (moov === null) {
    return null;
  }

  const trak = getBoxContent(moov, 0x7472616B /* "trak" */);
  if (trak === null) {
    return null;
  }

  const tkhd = getBoxContent(trak, 0x746B6864 /* "tkhd" */);
  if (tkhd === null) {
    return null;
  }
  let cursor = 0;
  const version = tkhd[cursor]; cursor += 1;
  cursor += 3; // skip flags
  if (version > 1) {
    return null;
  } else if (version === 1) {
    cursor += 32;
  } else {
    cursor += 20;
  }
  cursor += 52;
  const width = be2toi(tkhd, cursor);
  const height = be2toi(tkhd, cursor + 4);
  return [width, height];
}

/**
 * Calculate segment duration approximation by additioning the duration from
 * every samples in a trun ISOBMFF box.
 *
 * Returns `undefined` if we could not parse the duration.
 * @param {Uint8Array} buffer
 * @returns {number | undefined}
 */
export function getDurationFromTrun(buffer: Uint8Array): number|undefined {
  const traf = getTRAF(buffer);
  if (traf === null) {
    return undefined;
  }

  const trun = getBoxContent(traf, 0x7472756E /* trun */);
  if (trun === null) {
    return undefined;
  }
  let cursor = 0;
  const version = trun[cursor]; cursor += 1;
  if (version > 1) {
    return undefined;
  }

  const flags = be3toi(trun, cursor); cursor += 3;
  const hasSampleDuration = (flags & 0x000100) > 0;

  let defaultDuration: number|undefined = 0;
  if (!hasSampleDuration) {
    defaultDuration = getDefaultDurationFromTFHDInTRAF(traf);
    if (defaultDuration === undefined) {
      return undefined;
    }
  }

  const hasDataOffset = (flags & 0x000001) > 0;
  const hasFirstSampleFlags = (flags & 0x000004) > 0;
  const hasSampleSize = (flags & 0x000200) > 0;
  const hasSampleFlags = (flags & 0x000400) > 0;
  const hasSampleCompositionOffset = (flags & 0x000800) > 0;

  const sampleCounts = be4toi(trun, cursor); cursor += 4;

  if (hasDataOffset) {
    cursor += 4;
  }
  if (hasFirstSampleFlags) {
    cursor += 4;
  }

  let i = sampleCounts;
  let duration = 0;
  while (i-- > 0) {
    if (hasSampleDuration) {
      duration += be4toi(trun, cursor);
      cursor += 4;
    } else {
      duration += defaultDuration;
    }
    if (hasSampleSize) {
      cursor += 4;
    }
    if (hasSampleFlags) {
      cursor += 4;
    }
    if (hasSampleCompositionOffset) {
      cursor += 4;
    }
  }

  return duration;
}

export function getDurationFromSegmentSidx(buffer: Uint8Array): number|undefined {
  const sidxOffsets = getBoxOffsets(buffer, 0x73696478 /* "sidx" */);
  if (sidxOffsets === null) {
    return undefined;
  }
  // const boxSize = sidxOffsets[2] - sidxOffsets[0];
  let cursor = sidxOffsets[1];

  /* version(8) */
  /* flags(24) */
  /* reference_ID(32); */
  /* timescale(32); */
  const version = buffer[cursor]; cursor += 4 + 4;
  const timescale = be4toi(buffer, cursor); cursor += 4;

  /* earliest_presentation_time(32 / 64) */
  /* first_offset(32 / 64) */
  let totalDuration = 0;
  if (version === 0) {
    cursor += 4;
    cursor += 4;
  } else if (version === 1) {
    cursor += 8;
    cursor += 8;
  } else {
    return undefined;
  }

  /* reserved(16) */
  /* reference_count(16) */
  cursor += 2;
  let count = be2toi(buffer, cursor);
  cursor += 2;
  while (--count >= 0 && cursor < sidxOffsets[2]) {
    /* reference_type(1) */
    /* reference_size(31) */
    /* segment_duration(32) */
    /* sap..(32) */
    cursor += 4;
    const duration = be4toi(buffer, cursor);
    cursor += 4;
    cursor += 4;
    totalDuration += duration;
  }

  return totalDuration / timescale;
}

/**
 * Returns the "default sample duration" which is the default value for duration
 * of samples found in a "traf" ISOBMFF box.
 *
 * Returns `undefined` if no "default sample duration" has been found.
 * @param {Uint8Array} traf
 * @returns {number|undefined}
 */
function getDefaultDurationFromTFHDInTRAF(traf: Uint8Array): number|undefined {
  const tfhd = getBoxContent(traf, 0x74666864 /* tfhd */);
  if (tfhd === null) {
    return undefined;
  }

  let cursor = /* version */ 1;

  const flags = be3toi(tfhd, cursor); cursor += 3;
  const hasBaseDataOffset = (flags & 0x000001) > 0;
  const hasSampleDescriptionIndex = (flags & 0x000002) > 0;
  const hasDefaultSampleDuration = (flags & 0x000008) > 0;

  if (!hasDefaultSampleDuration) {
    return undefined;
  }
  cursor += 4;

  if (hasBaseDataOffset) {
    cursor += 8;
  }

  if (hasSampleDescriptionIndex) {
    cursor += 4;
  }

  const defaultDuration = be4toi(tfhd, cursor);
  return defaultDuration;
}
