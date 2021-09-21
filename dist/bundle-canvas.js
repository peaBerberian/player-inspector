(function () {
    'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __spreadArray(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
                if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                ar[i] = from[i];
            }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
    }

    /**
     * Translate groups of 2 big-endian bytes to Integer (from 0 up to 65535).
     * @param {Uint8Array} bytes
     * @param {Number} offset - The offset (from the start of the given array)
     * @returns {Number}
     */
    function be2toi(bytes, offset) {
        return ((bytes[offset + 0] << 8) +
            (bytes[offset + 1] << 0));
    }
    /**
     * Translate groups of 3 big-endian bytes to Integer.
     * @param {Uint8Array} bytes
     * @param {Number} offset - The offset (from the start of the given array)
     * @returns {Number}
     */
    function be3toi(bytes, offset) {
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
    function be4toi(bytes, offset) {
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
    function be8toi(bytes, offset) {
        return (((bytes[offset + 0] * 0x1000000) +
            (bytes[offset + 1] * 0x0010000) +
            (bytes[offset + 2] * 0x0000100) +
            (bytes[offset + 3])) * 0x100000000 +
            (bytes[offset + 4] * 0x1000000) +
            (bytes[offset + 5] * 0x0010000) +
            (bytes[offset + 6] * 0x0000100) +
            (bytes[offset + 7]));
    }

    var stypHex = 0x73747970;
    var ftypHex = 0x66747970;
    var moofHex = 0x6D6F6F66;
    var moovHex = 0x6D6F6F76;
    function isISOBMFFInitSegment(buffer) {
        var firstBox = new DataView(buffer).getUint32(4);
        return firstBox === moovHex || firstBox === ftypHex;
    }
    function isISOBMFFMediaSegment(buffer) {
        var firstBox = new DataView(buffer).getUint32(4);
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
    function getTrackFragmentDecodeTime(buffer) {
        var traf = getTRAF(buffer);
        if (traf === null) {
            return undefined;
        }
        var tfdt = getBoxContent(traf, 0x74666474 /* tfdt */);
        if (tfdt === null) {
            return undefined;
        }
        var version = tfdt[0];
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
    function getTRAF(buffer) {
        var moof = getBoxContent(buffer, 0x6D6F6F66 /* moof */);
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
    function getBoxContent(buf, boxName) {
        var offsets = getBoxOffsets(buf, boxName);
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
    function getBoxOffsets(buf, boxName) {
        var len = buf.length;
        var boxBaseOffset = 0;
        var name;
        var lastBoxSize = 0;
        var lastOffset;
        while (boxBaseOffset + 8 <= len) {
            lastOffset = boxBaseOffset;
            lastBoxSize = be4toi(buf, lastOffset);
            lastOffset += 4;
            name = be4toi(buf, lastOffset);
            lastOffset += 4;
            if (lastBoxSize === 0) {
                lastBoxSize = len - boxBaseOffset;
            }
            else if (lastBoxSize === 1) {
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
            }
            else {
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
    function getMDHDTimescale(buffer) {
        var mdia = getMDIA(buffer);
        if (mdia === null) {
            return undefined;
        }
        var mdhd = getBoxContent(mdia, 0x6D646864 /* "mdhd" */);
        if (mdhd === null) {
            return undefined;
        }
        var cursor = 0;
        var version = mdhd[cursor];
        cursor += 4;
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
    function getMDIA(buf) {
        var moov = getBoxContent(buf, 0x6D6F6F76 /* moov */);
        if (moov === null) {
            return null;
        }
        var trak = getBoxContent(moov, 0x7472616B /* "trak" */);
        if (trak === null) {
            return null;
        }
        return getBoxContent(trak, 0x6D646961 /* "mdia" */);
    }
    /**
     * @param {Uint8Array} buffer
     * @returns {Array.<number>}
     */
    function getWidthAndHeight(buf) {
        var moov = getBoxContent(buf, 0x6D6F6F76 /* moov */);
        if (moov === null) {
            return null;
        }
        var trak = getBoxContent(moov, 0x7472616B /* "trak" */);
        if (trak === null) {
            return null;
        }
        var tkhd = getBoxContent(trak, 0x746B6864 /* "tkhd" */);
        if (tkhd === null) {
            return null;
        }
        var cursor = 0;
        var version = tkhd[cursor];
        cursor += 1;
        cursor += 3; // skip flags
        if (version > 1) {
            return null;
        }
        else if (version === 1) {
            cursor += 32;
        }
        else {
            cursor += 20;
        }
        cursor += 52;
        var width = be2toi(tkhd, cursor);
        var height = be2toi(tkhd, cursor + 4);
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
    function getDurationFromTrun(buffer) {
        var traf = getTRAF(buffer);
        if (traf === null) {
            return undefined;
        }
        var trun = getBoxContent(traf, 0x7472756E /* trun */);
        if (trun === null) {
            return undefined;
        }
        var cursor = 0;
        var version = trun[cursor];
        cursor += 1;
        if (version > 1) {
            return undefined;
        }
        var flags = be3toi(trun, cursor);
        cursor += 3;
        var hasSampleDuration = (flags & 0x000100) > 0;
        var defaultDuration = 0;
        if (!hasSampleDuration) {
            defaultDuration = getDefaultDurationFromTFHDInTRAF(traf);
            if (defaultDuration === undefined) {
                return undefined;
            }
        }
        var hasDataOffset = (flags & 0x000001) > 0;
        var hasFirstSampleFlags = (flags & 0x000004) > 0;
        var hasSampleSize = (flags & 0x000200) > 0;
        var hasSampleFlags = (flags & 0x000400) > 0;
        var hasSampleCompositionOffset = (flags & 0x000800) > 0;
        var sampleCounts = be4toi(trun, cursor);
        cursor += 4;
        if (hasDataOffset) {
            cursor += 4;
        }
        if (hasFirstSampleFlags) {
            cursor += 4;
        }
        var i = sampleCounts;
        var duration = 0;
        while (i-- > 0) {
            if (hasSampleDuration) {
                duration += be4toi(trun, cursor);
                cursor += 4;
            }
            else {
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
    function getDurationFromSegmentSidx(buffer) {
        var sidxOffsets = getBoxOffsets(buffer, 0x73696478 /* "sidx" */);
        if (sidxOffsets === null) {
            return undefined;
        }
        // const boxSize = sidxOffsets[2] - sidxOffsets[0];
        var cursor = sidxOffsets[1];
        /* version(8) */
        /* flags(24) */
        /* reference_ID(32); */
        /* timescale(32); */
        var version = buffer[cursor];
        cursor += 4 + 4;
        var timescale = be4toi(buffer, cursor);
        cursor += 4;
        /* earliest_presentation_time(32 / 64) */
        /* first_offset(32 / 64) */
        var totalDuration = 0;
        if (version === 0) {
            cursor += 4;
            cursor += 4;
        }
        else if (version === 1) {
            cursor += 8;
            cursor += 8;
        }
        else {
            return undefined;
        }
        /* reserved(16) */
        /* reference_count(16) */
        cursor += 2;
        var count = be2toi(buffer, cursor);
        cursor += 2;
        while (--count >= 0 && cursor < sidxOffsets[2]) {
            /* reference_type(1) */
            /* reference_size(31) */
            /* segment_duration(32) */
            /* sap..(32) */
            cursor += 4;
            var duration = be4toi(buffer, cursor);
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
    function getDefaultDurationFromTFHDInTRAF(traf) {
        var tfhd = getBoxContent(traf, 0x74666864 /* tfhd */);
        if (tfhd === null) {
            return undefined;
        }
        var cursor = /* version */ 1;
        var flags = be3toi(tfhd, cursor);
        cursor += 3;
        var hasBaseDataOffset = (flags & 0x000001) > 0;
        var hasSampleDescriptionIndex = (flags & 0x000002) > 0;
        var hasDefaultSampleDuration = (flags & 0x000008) > 0;
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
        var defaultDuration = be4toi(tfhd, cursor);
        return defaultDuration;
    }

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
    function hashBuffer(buffer) {
        var hash = 0;
        var char;
        for (var i = 0; i < buffer.length; i++) {
            char = buffer[i];
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    /**
     * Minimum duration in seconds a segment should be into a buffered range to be
     * considered as part of that range.
     * Segments which have less than this amount of time "linked" to a buffered
     * range will be deleted.
     *
     * Setting a value too low can lead in worst-case scenarios to segments being
     * wrongly linked to the next or previous range it is truly linked too (if
     * those ranges are too close).
     *
     * Setting a value too high can lead to part of the buffer not being assigned
     * any segment. It also limits the minimum duration a segment can be.
     *
     * TODO As of now, this limits the minimum size a complete segment can be. A
     * better logic would be to also consider the duration of a segment. Though
     * this logic could lead to bugs with the current code.
     * @type {Number}
     */
    var MINIMUM_SEGMENT_SIZE = 0.005;
    /**
     * The maximum authorized difference, in seconds, between the real buffered
     * time of a given chunk and what the segment information of the Manifest
     * tells us.
     *
     * Setting a value too high can lead to parts of the media buffer being
     * linked to the wrong segments and to segments wrongly believed to be still
     * complete (instead of garbage collected).
     *
     * Setting a value too low can lead to parts of the media buffer not being
     * linked to the concerned segment and to segments wrongly believed to be
     * partly garbage collected (instead of complete segments).
     * @type {Number}
     */
    var MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE = 0.4;
    /**
     * The maximum authorized difference, in seconds, between the duration a
     * segment should have according to the Manifest and the actual duration it
     * seems to have once pushed to the media buffer.
     *
     * Setting a value too high can lead to parts of the media buffer being
     * linked to the wrong segments and to segments wrongly believed to be still
     * complete (instead of garbage collected).
     *
     * Setting a value too low can lead to parts of the media buffer not being
     * linked to the concerned segment and to segments wrongly believed to be
     * partly garbage collected (instead of complete segments). This last point
     * could lead to unnecessary segment re-downloading.
     * @type {Number}
     */
    var MAX_MANIFEST_BUFFERED_DURATION_DIFFERENCE = 0.3;
    /**
     * Keep track of every chunk downloaded and currently in the linked media
     * buffer.
     *
     * The main point of this class is to know which chunks are already pushed to
     * the corresponding media buffer, at which bitrate, and which have been garbage-collected
     * since by the browser (and thus may need to be re-loaded).
     * @class SegmentInventory
     */
    var SegmentInventory = /** @class */ (function () {
        function SegmentInventory() {
            this._inventory = [];
        }
        /**
         * Reset the whole inventory.
         */
        SegmentInventory.prototype.reset = function () {
            this._inventory.length = 0;
        };
        /**
         * Infer each segment's `bufferedStart` and `bufferedEnd` properties from the
         * TimeRanges given.
         *
         * The TimeRanges object given should come from the media buffer linked to
         * that SegmentInventory.
         *
         * /!\ A SegmentInventory should not be associated to multiple media buffers
         * at a time, so each `synchronizeBuffered` call should be given a TimeRanges
         * coming from the same buffer.
         * @param {TimeRanges}
         */
        SegmentInventory.prototype.synchronizeBuffered = function (buffered) {
            var inventory = this._inventory;
            var inventoryIndex = 0; // Current index considered.
            var thisSegment = inventory[0]; // Current segmentInfos considered
            var rangesLength = buffered.length;
            for (var i = 0; i < rangesLength; i++) {
                if (thisSegment === undefined) { // we arrived at the end of our inventory
                    return;
                }
                // take the i'nth contiguous buffered TimeRange
                var rangeStart = buffered.start(i);
                var rangeEnd = buffered.end(i);
                if (rangeEnd - rangeStart < MINIMUM_SEGMENT_SIZE) {
                    console.warn("SI: skipped TimeRange when synchronizing because it was too small", rangeStart, rangeEnd);
                    continue;
                }
                var indexBefore = inventoryIndex; // keep track of that number
                // Find the first segment either within this TimeRange or completely past
                // it:
                // skip until first segment with at least `MINIMUM_SEGMENT_SIZE` past the
                // start of that range.
                while (thisSegment !== undefined &&
                    (takeFirstSet(thisSegment.bufferedEnd, thisSegment.end)
                        - rangeStart) < MINIMUM_SEGMENT_SIZE) {
                    thisSegment = inventory[++inventoryIndex];
                }
                // Contains infos about the last garbage-collected segment before
                // `thisSegment`.
                var lastDeletedSegmentInfos = null;
                // remove garbage-collected segments
                // (Those not in that TimeRange nor in the previous one)
                var numberOfSegmentToDelete = inventoryIndex - indexBefore;
                if (numberOfSegmentToDelete > 0) {
                    var lastDeletedSegment = // last garbage-collected segment
                     inventory[indexBefore + numberOfSegmentToDelete - 1];
                    lastDeletedSegmentInfos = {
                        end: takeFirstSet(lastDeletedSegment.bufferedEnd, lastDeletedSegment.end),
                        precizeEnd: lastDeletedSegment.precizeEnd,
                    };
                    // console.debug(`SI: ${numberOfSegmentToDelete} segments GCed.`);
                    inventory.splice(indexBefore, numberOfSegmentToDelete);
                    inventoryIndex = indexBefore;
                }
                if (thisSegment === undefined) {
                    return;
                }
                // If the current segment is actually completely outside that range (it
                // is contained in one of the next one), skip that part.
                if (rangeEnd -
                    takeFirstSet(thisSegment.bufferedStart, thisSegment.start)
                    >= MINIMUM_SEGMENT_SIZE) {
                    guessBufferedStartFromRangeStart(thisSegment, rangeStart, lastDeletedSegmentInfos);
                    if (inventoryIndex === inventory.length - 1) {
                        // This is the last segment in the inventory.
                        // We can directly update the end as the end of the current range.
                        guessBufferedEndFromRangeEnd(thisSegment, rangeEnd);
                        return;
                    }
                    thisSegment = inventory[++inventoryIndex];
                    // Make contiguous until first segment outside that range
                    var thisSegmentStart = takeFirstSet(thisSegment.bufferedStart, thisSegment.start);
                    var thisSegmentEnd = takeFirstSet(thisSegment.bufferedEnd, thisSegment.end);
                    var nextRangeStart = i < rangesLength - 1 ? buffered.start(i + 1) :
                        undefined;
                    while (thisSegment !== undefined &&
                        (rangeEnd - thisSegmentStart) >= MINIMUM_SEGMENT_SIZE &&
                        (nextRangeStart === undefined ||
                            rangeEnd - thisSegmentStart >= thisSegmentEnd - nextRangeStart)) {
                        var prevSegment = inventory[inventoryIndex - 1];
                        // those segments are contiguous, we have no way to infer their real
                        // end
                        if (prevSegment.bufferedEnd === undefined) {
                            prevSegment.bufferedEnd = thisSegment.precizeStart ? thisSegment.start :
                                prevSegment.end;
                            // console.debug("SI: calculating buffered end of contiguous segment",
                            //               prevSegment.bufferedEnd, prevSegment.end);
                        }
                        thisSegment.bufferedStart = prevSegment.bufferedEnd;
                        thisSegment = inventory[++inventoryIndex];
                        if (thisSegment !== undefined) {
                            thisSegmentStart = takeFirstSet(thisSegment.bufferedStart, thisSegment.start);
                            thisSegmentEnd = takeFirstSet(thisSegment.bufferedEnd, thisSegment.end);
                        }
                    }
                }
                // update the bufferedEnd of the last segment in that range
                var lastSegmentInRange = inventory[inventoryIndex - 1];
                if (lastSegmentInRange !== undefined) {
                    guessBufferedEndFromRangeEnd(lastSegmentInRange, rangeEnd);
                }
            }
            // if we still have segments left, they are not affiliated to any range.
            // They might have been garbage collected, delete them from here.
            if (thisSegment != null) {
                // console.debug("SI: last segments have been GCed",
                //               inventoryIndex, inventory.length);
                inventory.splice(inventoryIndex, inventory.length - inventoryIndex);
            }
        };
        /**
         * Add a new chunk in the inventory.
         *
         * Chunks are decodable sub-parts of a whole segment. Once all chunks in a
         * segment have been inserted, you should call the `completeSegment` method.
         * @param {Object} chunkInformation
         */
        SegmentInventory.prototype.insertChunk = function (start, end, representationInfo) {
            if (start >= end) {
                console.warn("SI: Invalid chunked inserted: starts before it ends", start, end);
                return;
            }
            var inventory = this._inventory;
            var newSegment = {
                splitted: false,
                start: start,
                end: end,
                precizeStart: false,
                precizeEnd: false,
                bufferedStart: undefined,
                bufferedEnd: undefined,
                representationInfo: representationInfo,
            };
            // begin by the end as in most use cases this will be faster
            for (var i = inventory.length - 1; i >= 0; i--) {
                var segmentI = inventory[i];
                if ((segmentI.start) <= start) {
                    if ((segmentI.end) <= start) {
                        // our segment is after, push it after this one
                        //
                        // Case 1:
                        //   prevSegment  : |------|
                        //   newSegment   :        |======|
                        //   ===>         : |------|======|
                        //
                        // Case 2:
                        //   prevSegment  : |------|
                        //   newSegment   :          |======|
                        //   ===>         : |------| |======|
                        // console.debug("SI: Pushing segment strictly after previous one.",
                        //               start, segmentI.end);
                        this._inventory.splice(i + 1, 0, newSegment);
                        i += 2; // Go to segment immediately after newSegment
                        while (i < inventory.length && inventory[i].start < newSegment.end) {
                            if (inventory[i].end > newSegment.end) {
                                // The next segment ends after newSegment.
                                // Mutate the next segment.
                                //
                                // Case 1:
                                //   prevSegment  : |------|
                                //   newSegment   :        |======|
                                //   nextSegment  :            |----|
                                //   ===>         : |------|======|-|
                                // console.debug("SI: Segment pushed updates the start of the next one",
                                //               newSegment.end, inventory[i].start);
                                inventory[i].start = newSegment.end;
                                inventory[i].bufferedStart = undefined;
                                inventory[i].precizeStart = inventory[i].precizeStart &&
                                    newSegment.precizeEnd;
                                return;
                            }
                            // The next segment was completely contained in newSegment.
                            // Remove it.
                            //
                            // Case 1:
                            //   prevSegment  : |------|
                            //   newSegment   :        |======|
                            //   nextSegment  :          |---|
                            //   ===>         : |------|======|
                            //
                            // Case 2:
                            //   prevSegment  : |------|
                            //   newSegment   :        |======|
                            //   nextSegment  :          |----|
                            //   ===>         : |------|======|
                            // console.debug("SI: Segment pushed removes the next one",
                            //               start, end, inventory[i].start, inventory[i].end);
                            inventory.splice(i, 1);
                        }
                        return;
                    }
                    else {
                        if (segmentI.start === start) {
                            if (segmentI.end <= end) {
                                // In those cases, replace
                                //
                                // Case 1:
                                //  prevSegment  : |-------|
                                //  newSegment   : |=======|
                                //  ===>         : |=======|
                                //
                                // Case 2:
                                //  prevSegment  : |-------|
                                //  newSegment   : |==========|
                                //  ===>         : |==========|
                                // console.debug("SI: Segment pushed replace another one",
                                //               start, end, segmentI.end);
                                this._inventory.splice(i, 1, newSegment);
                                i += 1; // Go to segment immediately after newSegment
                                while (i < inventory.length && inventory[i].start < newSegment.end) {
                                    if (inventory[i].end > newSegment.end) {
                                        // The next segment ends after newSegment.
                                        // Mutate the next segment.
                                        //
                                        // Case 1:
                                        //   newSegment   : |======|
                                        //   nextSegment  :      |----|
                                        //   ===>         : |======|--|
                                        // console.debug("SI: Segment pushed updates the start of the next one",
                                        //               newSegment.end, inventory[i].start);
                                        inventory[i].start = newSegment.end;
                                        inventory[i].bufferedStart = undefined;
                                        inventory[i].precizeStart = inventory[i].precizeStart &&
                                            newSegment.precizeEnd;
                                        return;
                                    }
                                    // The next segment was completely contained in newSegment.
                                    // Remove it.
                                    //
                                    // Case 1:
                                    //   newSegment   : |======|
                                    //   nextSegment  :   |---|
                                    //   ===>         : |======|
                                    //
                                    // Case 2:
                                    //   newSegment   : |======|
                                    //   nextSegment  :   |----|
                                    //   ===>         : |======|
                                    // console.debug("SI: Segment pushed removes the next one",
                                    //               start, end, inventory[i].start, inventory[i].end);
                                    inventory.splice(i, 1);
                                }
                                return;
                            }
                            else {
                                // The previous segment starts at the same time and finishes
                                // after the new segment.
                                // Update the start of the previous segment and put the new
                                // segment before.
                                //
                                // Case 1:
                                //  prevSegment  : |------------|
                                //  newSegment   : |==========|
                                //  ===>         : |==========|-|
                                // console.debug("SI: Segment pushed ends before another with the same start",
                                //               start, end, segmentI.end);
                                inventory.splice(i, 0, newSegment);
                                segmentI.start = newSegment.end;
                                segmentI.bufferedStart = undefined;
                                segmentI.precizeStart = segmentI.precizeStart &&
                                    newSegment.precizeEnd;
                                return;
                            }
                        }
                        else {
                            if (segmentI.end <= newSegment.end) {
                                // our segment has a "complex" relation with this one,
                                // update the old one end and add this one after it.
                                //
                                // Case 1:
                                //  prevSegment  : |-------|
                                //  newSegment   :    |======|
                                //  ===>         : |--|======|
                                //
                                // Case 2:
                                //  prevSegment  : |-------|
                                //  newSegment   :    |====|
                                //  ===>         : |--|====|
                                // console.debug("SI: Segment pushed updates end of previous one",
                                //               start, end, segmentI.start, segmentI.end);
                                this._inventory.splice(i + 1, 0, newSegment);
                                segmentI.end = newSegment.start;
                                segmentI.bufferedEnd = undefined;
                                segmentI.precizeEnd = segmentI.precizeEnd &&
                                    newSegment.precizeStart;
                                i += 2; // Go to segment immediately after newSegment
                                while (i < inventory.length && inventory[i].start < newSegment.end) {
                                    if (inventory[i].end > newSegment.end) {
                                        // The next segment ends after newSegment.
                                        // Mutate the next segment.
                                        //
                                        // Case 1:
                                        //   newSegment   : |======|
                                        //   nextSegment  :      |----|
                                        //   ===>         : |======|--|
                                        // console.debug("SI: Segment pushed updates the start of the next one",
                                        //               newSegment.end, inventory[i].start);
                                        inventory[i].start = newSegment.end;
                                        inventory[i].bufferedStart = undefined;
                                        inventory[i].precizeStart = inventory[i].precizeStart &&
                                            newSegment.precizeEnd;
                                        return;
                                    }
                                    // The next segment was completely contained in newSegment.
                                    // Remove it.
                                    //
                                    // Case 1:
                                    //   newSegment   : |======|
                                    //   nextSegment  :   |---|
                                    //   ===>         : |======|
                                    //
                                    // Case 2:
                                    //   newSegment   : |======|
                                    //   nextSegment  :   |----|
                                    //   ===>         : |======|
                                    // console.debug("SI: Segment pushed removes the next one",
                                    //               start, end, inventory[i].start, inventory[i].end);
                                    inventory.splice(i, 1);
                                }
                                return;
                            }
                            else {
                                // The previous segment completely recovers the new segment.
                                // Split the previous segment into two segments, before and after
                                // the new segment.
                                //
                                // Case 1:
                                //  prevSegment  : |---------|
                                //  newSegment   :    |====|
                                //  ===>         : |--|====|-|
                                // console.debug("SI: Segment pushed is contained in a previous one",
                                //               start, end, segmentI.start, segmentI.end);
                                var nextSegment = { splitted: true,
                                    representationInfo: newSegment.representationInfo,
                                    start: newSegment.end,
                                    end: segmentI.end,
                                    precizeStart: segmentI.precizeStart &&
                                        segmentI.precizeEnd &&
                                        newSegment.precizeEnd,
                                    precizeEnd: segmentI.precizeEnd,
                                    bufferedStart: undefined,
                                    bufferedEnd: segmentI.end };
                                segmentI.end = newSegment.start;
                                segmentI.splitted = true;
                                segmentI.bufferedEnd = undefined;
                                segmentI.precizeEnd = segmentI.precizeEnd &&
                                    newSegment.precizeStart;
                                inventory.splice(i + 1, 0, newSegment);
                                inventory.splice(i + 2, 0, nextSegment);
                                return;
                            }
                        }
                    }
                }
            }
            // if we got here, we are at the first segment
            // check bounds of the previous first segment
            var firstSegment = this._inventory[0];
            if (firstSegment === undefined) { // we do not have any segment yet
                // console.debug("SI: first segment pushed", start, end);
                this._inventory.push(newSegment);
                return;
            }
            if (firstSegment.start >= end) {
                // our segment is before, put it before
                //
                // Case 1:
                //  firstSegment :      |----|
                //  newSegment   : |====|
                //  ===>         : |====|----|
                //
                // Case 2:
                //  firstSegment :        |----|
                //  newSegment   : |====|
                //  ===>         : |====| |----|
                // console.debug("SI: Segment pushed comes before all previous ones",
                //               start, end, firstSegment.start);
                this._inventory.splice(0, 0, newSegment);
            }
            else if (firstSegment.end <= end) {
                // Our segment is bigger, replace the first
                //
                // Case 1:
                //  firstSegment :   |---|
                //  newSegment   : |=======|
                //  ===>         : |=======|
                //
                // Case 2:
                //  firstSegment :   |-----|
                //  newSegment   : |=======|
                //  ===>         : |=======|
                // console.debug("SI: Segment pushed starts before and completely " +
                //               "recovers the previous first one",
                //               start, end , firstSegment.start, firstSegment.end);
                this._inventory.splice(0, 1, newSegment);
                while (inventory.length > 1 && inventory[1].start < newSegment.end) {
                    if (inventory[1].end > newSegment.end) {
                        // The next segment ends after newSegment.
                        // Mutate the next segment.
                        //
                        // Case 1:
                        //   newSegment   : |======|
                        //   nextSegment  :      |----|
                        //   ===>         : |======|--|
                        // console.debug("SI: Segment pushed updates the start of the next one",
                        //               newSegment.end, inventory[1].start);
                        inventory[1].start = newSegment.end;
                        inventory[1].bufferedStart = undefined;
                        inventory[1].precizeStart = newSegment.precizeEnd;
                        return;
                    }
                    // The next segment was completely contained in newSegment.
                    // Remove it.
                    //
                    // Case 1:
                    //   newSegment   : |======|
                    //   nextSegment  :   |---|
                    //   ===>         : |======|
                    //
                    // Case 2:
                    //   newSegment   : |======|
                    //   nextSegment  :   |----|
                    //   ===>         : |======|
                    // console.debug("SI: Segment pushed removes the next one",
                    //               start, end, inventory[1].start, inventory[1].end);
                    inventory.splice(1, 1);
                }
                return;
            }
            else {
                // our segment has a "complex" relation with the first one,
                // update the old one start and add this one before it.
                //
                // Case 1:
                //  firstSegment :    |------|
                //  newSegment   : |======|
                //  ===>         : |======|--|
                // console.debug("SI: Segment pushed start of the next one",
                //               start, end, firstSegment.start, firstSegment.end);
                firstSegment.start = end;
                firstSegment.bufferedStart = undefined;
                firstSegment.precizeStart = newSegment.precizeEnd;
                this._inventory.splice(0, 0, newSegment);
                return;
            }
        };
        /**
         * Returns the whole inventory.
         *
         * To get a list synchronized with what a media buffer actually has buffered
         * you might want to call `synchronizeBuffered` before calling this method.
         * @returns {Array.<Object>}
         */
        SegmentInventory.prototype.getInventory = function () {
            return this._inventory;
        };
        return SegmentInventory;
    }());
    /**
     * Returns `true` if the buffered start of the given chunk looks coherent enough
     * relatively to what is announced in the Manifest.
     * @param {Object} thisSegment
     * @returns {Boolean}
     */
    function bufferedStartLooksCoherent(thisSegment) {
        if (thisSegment.bufferedStart === undefined) {
            return false;
        }
        var start = thisSegment.start, end = thisSegment.end;
        var duration = end - start;
        return Math.abs(start - thisSegment.bufferedStart) <=
            MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE &&
            (thisSegment.bufferedEnd === undefined ||
                thisSegment.bufferedEnd > thisSegment.bufferedStart &&
                    Math.abs(thisSegment.bufferedEnd - thisSegment.bufferedStart -
                        duration) <= Math.min(MAX_MANIFEST_BUFFERED_DURATION_DIFFERENCE, duration / 3));
    }
    /**
     * Returns `true` if the buffered end of the given chunk looks coherent enough
     * relatively to what is announced in the Manifest.
     * @param {Object} thisSegment
     * @returns {Boolean}
     */
    function bufferedEndLooksCoherent(thisSegment) {
        if (thisSegment.bufferedEnd === undefined) {
            return false;
        }
        var start = thisSegment.start, end = thisSegment.end;
        var duration = end - start;
        return Math.abs(end - thisSegment.bufferedEnd) <=
            MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE &&
            thisSegment.bufferedStart != null &&
            thisSegment.bufferedEnd > thisSegment.bufferedStart &&
            Math.abs(thisSegment.bufferedEnd - thisSegment.bufferedStart -
                duration) <= Math.min(MAX_MANIFEST_BUFFERED_DURATION_DIFFERENCE, duration / 3);
    }
    /**
     * Evaluate the given buffered Chunk's buffered start from its range's start,
     * considering that this chunk is the first one in it.
     * @param {Object} firstSegmentInRange
     * @param {number} rangeStart
     * @param {Object} lastDeletedSegmentInfos
     */
    function guessBufferedStartFromRangeStart(firstSegmentInRange, rangeStart, lastDeletedSegmentInfos) {
        if (firstSegmentInRange.bufferedStart !== undefined) {
            if (firstSegmentInRange.bufferedStart < rangeStart) {
                // console.debug("SI: Segment partially GCed at the start",
                //               firstSegmentInRange.bufferedStart, rangeStart);
                firstSegmentInRange.bufferedStart = rangeStart;
            }
            if (!firstSegmentInRange.precizeStart &&
                bufferedStartLooksCoherent(firstSegmentInRange)) {
                firstSegmentInRange.start = firstSegmentInRange.bufferedStart;
                firstSegmentInRange.precizeStart = true;
            }
        }
        else if (firstSegmentInRange.precizeStart) {
            // console.debug("SI: buffered start is precize start",
            //               firstSegmentInRange.start);
            firstSegmentInRange.bufferedStart = firstSegmentInRange.start;
        }
        else if (lastDeletedSegmentInfos !== null &&
            lastDeletedSegmentInfos.end > rangeStart &&
            (lastDeletedSegmentInfos.precizeEnd ||
                firstSegmentInRange.start - lastDeletedSegmentInfos.end <=
                    MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE)) {
            // console.debug("SI: buffered start is end of previous segment",
            //               rangeStart,
            //               firstSegmentInRange.start,
            //               lastDeletedSegmentInfos.end);
            firstSegmentInRange.bufferedStart = lastDeletedSegmentInfos.end;
            if (bufferedStartLooksCoherent(firstSegmentInRange)) {
                firstSegmentInRange.start = lastDeletedSegmentInfos.end;
                firstSegmentInRange.precizeStart = true;
            }
        }
        else if (firstSegmentInRange.start - rangeStart <=
            MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE) {
            // console.debug("SI: found true buffered start",
            //               rangeStart, firstSegmentInRange.start);
            firstSegmentInRange.bufferedStart = rangeStart;
            if (bufferedStartLooksCoherent(firstSegmentInRange)) {
                firstSegmentInRange.start = rangeStart;
                firstSegmentInRange.precizeStart = true;
            }
        }
        else if (rangeStart < firstSegmentInRange.start) ;
        else {
            // console.debug("SI: Segment appears immediately garbage collected at the start",
            //               firstSegmentInRange.bufferedStart, rangeStart);
            firstSegmentInRange.bufferedStart = rangeStart;
        }
    }
    /**
     * Evaluate the given buffered Chunk's buffered end from its range's end,
     * considering that this chunk is the last one in it.
     * @param {Object} firstSegmentInRange
     * @param {number} rangeStart
     * @param {Object} infos
     */
    function guessBufferedEndFromRangeEnd(lastSegmentInRange, rangeEnd) {
        if (lastSegmentInRange.bufferedEnd !== undefined) {
            if (lastSegmentInRange.bufferedEnd > rangeEnd) {
                // console.debug("SI: Segment partially GCed at the end",
                //               lastSegmentInRange.bufferedEnd, rangeEnd);
                lastSegmentInRange.bufferedEnd = rangeEnd;
            }
            if (!lastSegmentInRange.precizeEnd &&
                rangeEnd - lastSegmentInRange.end <= MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE &&
                bufferedEndLooksCoherent(lastSegmentInRange)) {
                lastSegmentInRange.precizeEnd = true;
                lastSegmentInRange.end = rangeEnd;
            }
        }
        else if (lastSegmentInRange.precizeEnd) {
            // console.debug("SI: buffered end is precize end",
            //               lastSegmentInRange.end);
            lastSegmentInRange.bufferedEnd = lastSegmentInRange.end;
        }
        else if (rangeEnd - lastSegmentInRange.end <=
            MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE) {
            // console.debug("SI: found true buffered end",
            //               rangeEnd, lastSegmentInRange.end);
            lastSegmentInRange.bufferedEnd = rangeEnd;
            if (bufferedEndLooksCoherent(lastSegmentInRange)) {
                lastSegmentInRange.end = rangeEnd;
                lastSegmentInRange.precizeEnd = true;
            }
        }
        else if (rangeEnd > lastSegmentInRange.end) {
            // console.debug("SI: range end too far from expected end",
            //               rangeEnd, lastSegmentInRange.end);
            lastSegmentInRange.bufferedEnd = lastSegmentInRange.end;
        }
        else {
            // console.debug("SI: Segment appears immediately garbage collected at the end",
            //               lastSegmentInRange.bufferedEnd, rangeEnd);
            lastSegmentInRange.bufferedEnd = rangeEnd;
        }
    }
    function takeFirstSet() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var i = 0;
        var len = args.length;
        while (i < len) {
            var arg = args[i];
            if (arg != null) {
                return arg;
            }
            i++;
        }
        return undefined;
    }

    var MediaSourceStore = /** @class */ (function () {
        function MediaSourceStore() {
            this._stored = [];
        }
        MediaSourceStore.prototype.getStored = function () {
            return this._stored;
        };
        MediaSourceStore.prototype.addMediaSource = function (ms) {
            var newMsItem = {
                createdAt: performance.now(),
                sourceBuffers: [],
                instance: ms,
                urls: [],
                revokedUrls: [],
            };
            this._stored.push(newMsItem);
            return new MediaSourceReference(newMsItem);
        };
        MediaSourceStore.prototype.getReferences = function (ms) {
            return this._stored.reduce(function (acc, s) {
                if (s.instance === ms) {
                    acc.push(new MediaSourceReference(s));
                }
                return acc;
            }, []);
        };
        MediaSourceStore.prototype.getAllReferences = function () {
            return this._stored.map(function (s) {
                return new MediaSourceReference(s);
            }, []);
        };
        return MediaSourceStore;
    }());
    var MediaSourceReference = /** @class */ (function () {
        function MediaSourceReference(item) {
            this._wrapped = item;
        }
        MediaSourceReference.prototype.addSourceBuffer = function (sb, mimeType) {
            var segmentInventory = new SegmentInventory();
            var newSbItem = {
                instance: sb,
                createdAt: performance.now(),
                mimeType: mimeType,
                appended: [],
                removed: [],
                segmentInventory: segmentInventory,
            };
            this._wrapped.sourceBuffers.push(newSbItem);
            return new SourceBufferReference(newSbItem);
        };
        MediaSourceReference.prototype.addUrl = function (url) {
            this._wrapped.urls.push(url);
        };
        MediaSourceReference.prototype.revokeUrl = function (url) {
            while (true) {
                var indexOf = this._wrapped.urls.indexOf(url);
                if (indexOf < 0) {
                    return;
                }
                this._wrapped.urls.splice(indexOf, 1);
                this._wrapped.revokedUrls.push(url);
            }
        };
        return MediaSourceReference;
    }());
    var SourceBufferReference = /** @class */ (function () {
        function SourceBufferReference(item) {
            this._wrapped = item;
            this._lastInitTimescale = undefined;
            this._lastInitHash = undefined;
            this._representationInfo = {};
        }
        SourceBufferReference.prototype.appendSegment = function (data) {
            var dataAb = data instanceof ArrayBuffer ? data : data.buffer;
            var byteSize = dataAb.byteLength;
            var isMp4Media = isISOBMFFMediaSegment(dataAb);
            var isMp4Init = isISOBMFFInitSegment(dataAb);
            var addedSegmentItem = {
                addedAt: performance.now(),
                appendWindows: [
                    this._wrapped.instance.appendWindowStart,
                    this._wrapped.instance.appendWindowEnd,
                ],
                byteSize: byteSize,
                isISOBMFFMediaSegment: isMp4Media,
                isISOBMFFInitSegment: isMp4Init,
            };
            this._wrapped.appended.push(addedSegmentItem);
            // TODO webm
            // if (!addedSegmentItem.isISOBMFFMediaSegment &&
            //     !addedSegmentItem.isISOBMFFInitSegment) {
            //   const uintData = data instanceof Uint8Array ?
            //     data :
            //     new Uint8Array(dataAb);
            //   const timecodeScale = getTimeCodeScale(uintData, 0);
            //   const time = getFirstClusterTimestamp(uintData, 0);
            //   const duration = getDuration(uintData, 0);
            //   console.error("!!!!!", timecodeScale, time, duration);
            // }
            if (addedSegmentItem.isISOBMFFInitSegment) {
                var uintData = data instanceof Uint8Array ?
                    data :
                    new Uint8Array(dataAb);
                this._lastInitTimescale = getMDHDTimescale(uintData);
                var hashed = hashBuffer(uintData);
                this._lastInitHash = hashed;
                var widthAndHeight = getWidthAndHeight(uintData);
                if (this._representationInfo[hashed] === undefined) {
                    var newRepInfo = { representationId: String(hashed) };
                    if (widthAndHeight !== null) {
                        newRepInfo.width = widthAndHeight[0];
                        newRepInfo.height = widthAndHeight[1];
                    }
                    if (this._wrapped.mimeType.includes("video")) {
                        newRepInfo.type = "video";
                    }
                    else if (this._wrapped.mimeType.includes("audio")) {
                        newRepInfo.type = "audio";
                    }
                    this._representationInfo[hashed] = newRepInfo;
                }
                if (widthAndHeight !== null) {
                    addedSegmentItem.width = widthAndHeight[0];
                    addedSegmentItem.height = widthAndHeight[1];
                }
            }
            if (addedSegmentItem.isISOBMFFMediaSegment) {
                var uintData = data instanceof Uint8Array ?
                    data :
                    new Uint8Array(dataAb);
                if (this._lastInitTimescale !== undefined) {
                    var trafTime = getTrackFragmentDecodeTime(uintData);
                    var decodeTime = trafTime !== undefined ?
                        trafTime / this._lastInitTimescale :
                        undefined;
                    var trunDuration = getDurationFromTrun(uintData);
                    var duration = trunDuration !== undefined ?
                        trunDuration / this._lastInitTimescale :
                        getDurationFromSegmentSidx(uintData);
                    if (decodeTime !== undefined) {
                        addedSegmentItem.decodeTime = decodeTime;
                    }
                    if (duration !== undefined) {
                        addedSegmentItem.duration = duration;
                    }
                    var repInfo = this._lastInitHash === undefined ?
                        undefined :
                        this._representationInfo[this._lastInitHash];
                    if (duration !== undefined &&
                        decodeTime !== undefined &&
                        repInfo !== undefined) {
                        this._wrapped.segmentInventory.insertChunk(decodeTime, decodeTime + duration, repInfo);
                    }
                }
            }
        };
        SourceBufferReference.prototype.removeSegment = function (start, end) {
            this._wrapped.removed.push({
                removedAt: performance.now(),
                start: start,
                end: end,
            });
        };
        SourceBufferReference.prototype.synchronize = function () {
            this._wrapped.segmentInventory.synchronizeBuffered(this._wrapped.instance.buffered);
        };
        return SourceBufferReference;
    }());

    var mediaSourceStore = new MediaSourceStore();
    var originalMediaSource = window.MediaSource;
    function startMockingMediaSource() {
        function MediaSourceMock() {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            var realMediaSource = new (originalMediaSource.bind.apply(originalMediaSource, __spreadArray([void 0], args, false)))();
            var mediaSourceRef = mediaSourceStore.addMediaSource(realMediaSource);
            realMediaSource.addSourceBuffer = function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var mimeType = args[0];
                if (typeof mimeType !== "string") {
                    console.warn("Invalid MediaSource constructed, ignoring...");
                    return realMediaSource.addSourceBuffer.apply(realMediaSource, args);
                }
                var realSourceBuffer = originalMediaSource.prototype.addSourceBuffer.apply(realMediaSource, args);
                var sourceBufferRef = mediaSourceRef.addSourceBuffer(realSourceBuffer, mimeType);
                realSourceBuffer.addEventListener("update", function () {
                    sourceBufferRef.synchronize();
                });
                realSourceBuffer.appendBuffer = function () {
                    var data = arguments[0];
                    if (data == null ||
                        (!(data instanceof ArrayBuffer) &&
                            !(data.buffer instanceof ArrayBuffer))) {
                        console.warn("Invalid SourceBuffer.appendBuffer call, ignoring...");
                    }
                    else {
                        sourceBufferRef.appendSegment(data);
                    }
                    return SourceBuffer.prototype.appendBuffer.apply(this, arguments);
                };
                realSourceBuffer.remove = function () {
                    var start = arguments[0];
                    var end = arguments[1];
                    if (typeof start !== "number" || typeof end !== "number") {
                        console.warn("Invalid SourceBuffer.remove call, ignoring...");
                    }
                    else {
                        sourceBufferRef.removeSegment(start, end);
                    }
                    return SourceBuffer.prototype.remove.apply(this, arguments);
                };
                return realSourceBuffer;
            };
            return realMediaSource;
        }
        var originalCreateObjectURL = URL.createObjectURL;
        var originalRevokeObjectUrl = URL.revokeObjectURL;
        URL.createObjectURL = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            var url = originalCreateObjectURL.apply(void 0, args);
            var obj = args[0];
            if (obj instanceof MediaSource) {
                var msReferences = mediaSourceStore.getReferences(obj);
                for (var _a = 0, msReferences_1 = msReferences; _a < msReferences_1.length; _a++) {
                    var msReference = msReferences_1[_a];
                    msReference.addUrl(url);
                }
            }
            return url;
        };
        URL.revokeObjectURL = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            var url = args[0];
            var msReferences = mediaSourceStore.getAllReferences();
            for (var _a = 0, msReferences_2 = msReferences; _a < msReferences_2.length; _a++) {
                var msReference = msReferences_2[_a];
                msReference.revokeUrl(url);
            }
            return originalRevokeObjectUrl.apply(void 0, args);
        };
        var propDesc = Object.getOwnPropertyDescriptors(MediaSource);
        Object.defineProperties(MediaSourceMock, propDesc);
        window.MediaSource = MediaSourceMock;
        window.MediaSource.isMocked = true;
    }

    var CANVAS_WIDTH = 1000;
    var CANVAS_HEIGHT = 1;
    var COLORS = [
        // "#fe4a49",
        "#2ab7ca",
        "#fed766",
        "#4dd248",
        "#a22c28",
        "#556b2f",
        "#add8e6",
        "#90ee90",
        "#444444",
        "#40bfc1",
        "#57557e",
        "#fbe555",
        // "#f0134d",
    ];
    var COLOR_CURRENT_POSITION = "#FF2323";
    /**
     * Clear the whole canvas.
     * @param {Object} canvasContext
     */
    function clearCanvas(canvasContext) {
        canvasContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    /**
     * Represent the current position in the canvas.
     * @param {number|undefined} position - The current position
     * @param {number} minimumPosition - minimum possible position represented in
     * the canvas.
     * @param {number} maximumPosition - maximum possible position represented in
     * the canvas.
     * @param {Object} canvasCtx - The canvas' 2D context
     */
    function paintCurrentPosition(position, minimumPosition, maximumPosition, canvasCtx) {
        if (typeof position === "number" &&
            position >= minimumPosition &&
            position < maximumPosition) {
            var lengthCanvas = maximumPosition - minimumPosition;
            canvasCtx.fillStyle = COLOR_CURRENT_POSITION;
            canvasCtx.fillRect(Math.ceil((position - minimumPosition) /
                lengthCanvas * CANVAS_WIDTH) - 1, 0, 2, CANVAS_HEIGHT);
        }
    }
    /**
     * Scale given bufferedData in terms of percentage between the minimum and
     * maximum position. Filter out segment which are not part of it.
     * @param {Array.<Object>} bufferedData
     * @param {number} minimumPosition
     * @param {number} maximumPosition
     * @returns {Array.<Object>}
     */
    function scaleSegments(bufferedData, minimumPosition, maximumPosition) {
        var scaledSegments = [];
        var wholeDuration = maximumPosition - minimumPosition;
        for (var i = 0; i < bufferedData.length; i++) {
            var bufferedInfo = bufferedData[i];
            var start = bufferedInfo.bufferedStart === undefined ?
                bufferedInfo.start :
                bufferedInfo.bufferedStart;
            var end = bufferedInfo.bufferedEnd === undefined ?
                bufferedInfo.end :
                bufferedInfo.bufferedEnd;
            if (end > minimumPosition && start < maximumPosition) {
                var startPoint = Math.max(start - minimumPosition, 0);
                var endPoint = Math.min(end - minimumPosition, maximumPosition);
                var scaledStart = startPoint / wholeDuration;
                var scaledEnd = endPoint / wholeDuration;
                scaledSegments.push({ scaledStart: scaledStart, scaledEnd: scaledEnd, bufferedInfo: bufferedInfo });
            }
        }
        return scaledSegments;
    }
    function displayCanvas() {
        var canvasEl = document.createElement("canvas");
        canvasEl.style.height = "30px";
        canvasEl.style.opacity = "0.7";
        canvasEl.style.width = "calc(100% - 20px)";
        canvasEl.style.zIndex = "2147483647";
        canvasEl.style.backgroundColor = "#fff";
        canvasEl.style.border = "1px dotted black";
        canvasEl.style.position = "fixed";
        canvasEl.style.top = "10%";
        canvasEl.style.margin = "10px";
        canvasEl.height = CANVAS_HEIGHT;
        canvasEl.width = CANVAS_WIDTH;
        canvasEl.className = "PLAYER-INSPECTOR-CANVAS";
        canvasEl.onmouseleave = removeToolTip;
        canvasEl.onmousemove = onMouseMove;
        var representationsEncountered = [];
        var currentSegmentsScaled;
        /**
         * Paint a given segment in the canvas
         * @param {Object} scaledSegment - Buffered segment information with added
         * "scaling" information to know where it fits in the canvas.
         * @param {Object} canvasCtx - The canvas' 2D context
         */
        function paintSegment(scaledSegment, canvasCtx) {
            var representationId = scaledSegment.bufferedInfo.representationInfo.representationId;
            var indexOfRepr = representationsEncountered
                .indexOf(representationId);
            if (indexOfRepr < 0) {
                representationsEncountered.push(representationId);
                indexOfRepr = representationsEncountered.length - 1;
            }
            var colorIndex = indexOfRepr % COLORS.length;
            var color = COLORS[colorIndex];
            var startX = scaledSegment.scaledStart * CANVAS_WIDTH;
            var endX = scaledSegment.scaledEnd * CANVAS_WIDTH;
            canvasCtx.fillStyle = color;
            canvasCtx.fillRect(Math.ceil(startX), 0, Math.ceil(endX - startX), CANVAS_HEIGHT);
        }
        function getMousePositionInPercentage(event) {
            if (canvasEl === null || canvasEl === undefined) {
                return;
            }
            var rect = canvasEl.getBoundingClientRect();
            var point0 = rect.left;
            var clickPosPx = Math.max(event.clientX - point0, 0);
            var endPointPx = Math.max(rect.right - point0, 0);
            if (!endPointPx) {
                return 0;
            }
            return clickPosPx / endPointPx;
        }
        var minimumPosition;
        var maximumPosition;
        var currVideoElt;
        function getMousePosition(event) {
            if (minimumPosition === undefined || maximumPosition === undefined) {
                return undefined;
            }
            var mousePercent = getMousePositionInPercentage(event);
            var duration = Math.max(maximumPosition - minimumPosition, 0);
            return mousePercent === undefined ?
                undefined :
                mousePercent * duration + minimumPosition;
        }
        canvasEl.onclick = function (evt) {
            if (currVideoElt !== undefined) {
                var newPos = getMousePosition(evt);
                if (newPos !== undefined) {
                    currVideoElt.currentTime = newPos;
                }
            }
        };
        document.body.appendChild(canvasEl);
        setInterval(function () {
            var ctx = canvasEl.getContext("2d");
            if (ctx === null) {
                return;
            }
            canvasEl.width = CANVAS_WIDTH;
            canvasEl.height = CANVAS_HEIGHT;
            clearCanvas(ctx);
            var videoElts = document.getElementsByTagName("video");
            currVideoElt = undefined;
            for (var i = videoElts.length - 1; i >= 0; i--) {
                if (videoElts[i].buffered.length > 0) {
                    currVideoElt = videoElts[i];
                    break;
                }
            }
            if (currVideoElt === undefined) {
                return;
            }
            var mediaSourceArray = mediaSourceStore.getStored();
            if (mediaSourceArray.length === 0) {
                return;
            }
            var sourceBuffers = mediaSourceArray[mediaSourceArray.length - 1].sourceBuffers;
            var videoSb = sourceBuffers.find(function (s) { return s.mimeType.indexOf("video") >= 0; });
            if (!videoSb) {
                return;
            }
            var data = videoSb.segmentInventory.getInventory();
            minimumPosition = Math.max(0, currVideoElt.currentTime - 60 * 60);
            maximumPosition = Math.min(currVideoElt.duration, currVideoElt.buffered.end(currVideoElt.buffered.length - 1) +
                60 * 60);
            currentSegmentsScaled =
                scaleSegments(data, minimumPosition, maximumPosition);
            if (minimumPosition === undefined ||
                maximumPosition === undefined ||
                minimumPosition >= maximumPosition) {
                return;
            }
            for (var i = 0; i < currentSegmentsScaled.length; i++) {
                paintSegment(currentSegmentsScaled[i], ctx);
            }
            paintCurrentPosition(currVideoElt.currentTime, minimumPosition, maximumPosition, ctx);
        }, 300);
        function onMouseMove(event) {
            if (currentSegmentsScaled === undefined) {
                removeToolTip();
                return;
            }
            var mousePercent = getMousePositionInPercentage(event);
            if (mousePercent === undefined) {
                removeToolTip();
                return;
            }
            for (var i = 0; i < currentSegmentsScaled.length; i++) {
                var scaledSegment = currentSegmentsScaled[i];
                if (mousePercent >= scaledSegment.scaledStart &&
                    mousePercent < scaledSegment.scaledEnd) {
                    var _a = scaledSegment.bufferedInfo, start = _a.start, end = _a.end;
                    var _b = scaledSegment.bufferedInfo.representationInfo, representationId = _b.representationId, height = _b.height, width = _b.width;
                    var newTipText = "segment: [" + start.toFixed(1) + ", " + end.toFixed(1) + "]" + "\n" +
                        ("representationId: " + representationId);
                    if (height !== undefined) {
                        newTipText += "\n" + ("height: " + height);
                    }
                    if (width !== undefined) {
                        newTipText += "\n" + ("width: " + width);
                    }
                    displayToolTip(newTipText);
                    return;
                }
            }
            removeToolTip(); // if none found
        }
    }
    function removeToolTip() {
        var currentElt = document.getElementById("PLAYER-INSPECTOR-tooltip-wrapper");
        if (currentElt !== null && currentElt.parentElement !== null) {
            currentElt.parentElement.removeChild(currentElt);
        }
    }
    function displayToolTip(text) {
        var currentElt = document.getElementById("PLAYER-INSPECTOR-tooltip-wrapper");
        var div;
        var isNewDiv = false;
        if (currentElt !== null && currentElt.parentElement !== null) {
            var tip = currentElt.getElementsByClassName("PLAYER-INSPECTOR-tooltip")[0];
            if (tip !== undefined && tip.textContent === text) {
                return;
            }
            else {
                currentElt.innerHTML = "";
            }
            div = currentElt;
        }
        else {
            isNewDiv = true;
            div = document.createElement("div");
            div.id = "PLAYER-INSPECTOR-tooltip-wrapper";
            div.style.position = "absolute";
            div.style.display = "block";
            div.style.left = "0px";
            div.style.padding = "5px";
            div.style.fontSize = "12px";
            div.style.zIndex = "999999999999";
            div.style.transform = "scaleY(1)";
            div.style.animation = "fadein 0.6s";
            div.style.backgroundColor = "#1d1d1d";
            div.style.color = "white";
            div.style.top = "10px";
        }
        var pre = document.createElement("pre");
        pre.className = "PLAYER-INSPECTOR-tooltip";
        pre.textContent = text;
        pre.style.display = "inline";
        pre.style.fontFamily = "monospace, mono, sans-serif";
        pre.style.pointerEvents = "none";
        div.appendChild(pre);
        if (isNewDiv) {
            document.body.appendChild(div);
        }
    }

    var RequestState;
    (function (RequestState) {
        RequestState["OPENED"] = "opened";
        RequestState["LOADED"] = "loaded";
        RequestState["ERRORED"] = "errored";
        RequestState["ABORTED"] = "aborted";
        RequestState["PENDING"] = "pending";
    })(RequestState || (RequestState = {}));
    var RequestStore = /** @class */ (function () {
        function RequestStore() {
            this._store = [];
        }
        RequestStore.prototype.getStored = function () {
            return this._store;
        };
        RequestStore.prototype.open = function (method, url) {
            var newItem = {
                timestamps: { opened: performance.now() },
                method: method,
                url: url,
                state: RequestState.OPENED
            };
            this._store.push(newItem);
            return new RequestReference(newItem);
        };
        return RequestStore;
    }());
    var RequestReference = /** @class */ (function () {
        function RequestReference(item) {
            this._wrapped = item;
        }
        RequestReference.prototype.send = function () {
            if (this._wrapped.state !== RequestState.OPENED) {
                throw new Error("Request already sent");
            }
            this._wrapped.state = RequestState.PENDING;
            this._wrapped.timestamps.send = performance.now();
        };
        RequestReference.prototype.loaded = function (httpStatus, contentType, size) {
            if (this._wrapped.state !== RequestState.PENDING) {
                throw new Error("Request not pending");
            }
            this._wrapped.timestamps.succeeded = performance.now();
            this._wrapped.httpStatus = httpStatus;
            this._wrapped.state = RequestState.LOADED;
            if (contentType !== null) {
                this._wrapped.contentType = contentType;
            }
            if (size !== undefined) {
                this._wrapped.size = size;
            }
        };
        RequestReference.prototype.failed = function (httpStatus, contentType, size) {
            if (this._wrapped.state !== RequestState.PENDING) {
                throw new Error("Request not pending");
            }
            this._wrapped.timestamps.failed = performance.now();
            this._wrapped.httpStatus = httpStatus;
            this._wrapped.state = RequestState.ERRORED;
            if (contentType !== null) {
                this._wrapped.contentType = contentType;
            }
            if (size !== undefined) {
                this._wrapped.size = size;
            }
        };
        RequestReference.prototype.aborted = function () {
            if (this._wrapped.state !== RequestState.PENDING) {
                throw new Error("Request not pending");
            }
            this._wrapped.timestamps.aborted = performance.now();
            this._wrapped.state = RequestState.ABORTED;
        };
        return RequestReference;
    }());

    var originalXhrOpen = XMLHttpRequest.prototype.open;
    var requestStore = new RequestStore();
    function startMockingXHR() {
        XMLHttpRequest.prototype.open = function () {
            var method = arguments[0];
            var url = arguments[1];
            if (typeof method !== "string" || typeof url !== "string") {
                console.warn("Invalid open call on XHR, fallbacking...");
                return originalXhrOpen.apply(this, arguments);
            }
            var requestRef = requestStore.open(method, url);
            this.addEventListener("load", function () {
                requestRef.loaded(this.status, this.getResponseHeader("content-type"), getSize(this.response, this.responseType));
            });
            this.addEventListener("error", function () {
                requestRef.failed(this.status, this.getResponseHeader("content-type"), getSize(this.response, this.responseType));
            });
            this.abort = function () {
                requestRef.aborted();
                return XMLHttpRequest.prototype.abort.apply(this, arguments);
            };
            this.send = function () {
                requestRef.send();
                return XMLHttpRequest.prototype.send.apply(this, arguments);
            };
            return originalXhrOpen.apply(this, arguments);
        };
    }
    function getSize(response, responseType) {
        switch (responseType) {
            case "blob":
                return response.size;
            case "arraybuffer":
                return response.byteLength;
            case "":
            case "text":
                return response.length * 2;
            // TODO what if document / json / ms-stream?
        }
    }

    /**
     * This file should be bundled into an IIFE and be directly used as an
     * userscript.
     * It mocks MSE-related APIs - which will fill the exported
     * `mediaSourceStore` and `XMLHttpRequest`s, which will fill the
     * exported `requestStore`, as well as displaying a canvas providing a
     * visual representation of the page's video buffer when there is one.
     */
    startMockingMediaSource();
    startMockingXHR();
    var win = window;
    win.mediaSourceStore = mediaSourceStore;
    win.requestStore = requestStore;
    document.addEventListener('DOMContentLoaded', function () {
        displayCanvas();
    });

}());
