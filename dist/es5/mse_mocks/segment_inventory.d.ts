/**
 * Keep track of every chunk downloaded and currently in the linked media
 * buffer.
 *
 * The main point of this class is to know which chunks are already pushed to
 * the corresponding media buffer, at which bitrate, and which have been garbage-collected
 * since by the browser (and thus may need to be re-loaded).
 * @class SegmentInventory
 */
export default class SegmentInventory {
    /**
     * Keeps track of all the segments which should be currently in the browser's
     * memory.
     * This array contains objects, each being related to a single downloaded
     * chunk or segment which is at least partially added in the media buffer.
     */
    private _inventory;
    constructor();
    /**
     * Reset the whole inventory.
     */
    reset(): void;
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
    synchronizeBuffered(buffered: TimeRanges): void;
    /**
     * Add a new chunk in the inventory.
     *
     * Chunks are decodable sub-parts of a whole segment. Once all chunks in a
     * segment have been inserted, you should call the `completeSegment` method.
     * @param {Object} chunkInformation
     */
    insertChunk(start: number, end: number, representationInfo: RepresentationInfo): void;
    /**
     * Returns the whole inventory.
     *
     * To get a list synchronized with what a media buffer actually has buffered
     * you might want to call `synchronizeBuffered` before calling this method.
     * @returns {Array.<Object>}
     */
    getInventory(): BufferedSegmentInfo[];
}
/** Information stored on a single chunk by the SegmentInventory. */
export interface BufferedSegmentInfo {
    /**
     * Last inferred end in the media buffer this chunk ends at, in seconds.
     *
     * Depending on if contiguous chunks were around it during the first
     * synchronization for that chunk this value could be more or less precize.
     */
    bufferedEnd: number | undefined;
    /**
     * Last inferred start in the media buffer this chunk starts at, in seconds.
     *
     * Depending on if contiguous chunks were around it during the first
     * synchronization for that chunk this value could be more or less precize.
     */
    bufferedStart: number | undefined;
    /**
     * Supposed end, in seconds, the chunk is expected to end at.
     *
     * If the current `chunk` is part of a "partially pushed" segment (see
     * `partiallyPushed`), the definition of this property is flexible in the way
     * that it can correspond either to the end of the chunk or to the end of the
     * whole segment the chunk is linked to.
     * As such, this property should not be relied on until the segment has been
     * fully-pushed.
     */
    end: number;
    /**
     * If `true` the `end` property is an estimate the `SegmentInventory` has
     * a high confidence in.
     * In that situation, `bufferedEnd` can easily be compared to it to check if
     * that segment has been partially, or fully, garbage collected.
     *
     * If `false`, it is just a guess based on segment information.
     */
    precizeEnd: boolean;
    /**
     * If `true` the `start` property is an estimate the `SegmentInventory` has
     * a high confidence in.
     * In that situation, `bufferedStart` can easily be compared to it to check if
     * that segment has been partially, or fully, garbage collected.
     *
     * If `false`, it is just a guess based on segment information.
     */
    precizeStart: boolean;
    /**
     * If `true`, the segment as a whole is divided into multiple parts in the
     * buffer, with other segment(s) between them.
     * If `false`, it is contiguous.
     *
     * Splitted segments are a rare occurence that is more complicated to handle
     * than contiguous ones.
     */
    splitted: boolean;
    /**
     * Supposed start, in seconds, the chunk is expected to start at.
     *
     * If the current `chunk` is part of a "partially pushed" segment (see
     * `partiallyPushed`), the definition of this property is flexible in the way
     * that it can correspond either to the start of the chunk or to the start of
     * the whole segment the chunk is linked to.
     * As such, this property should not be relied on until the segment has been
     * fully-pushed.
     */
    start: number;
    representationInfo: RepresentationInfo;
}
export interface RepresentationInfo {
    representationId: string;
    type?: "audio" | "video";
    width?: number;
    height?: number;
    timescale?: number;
}
