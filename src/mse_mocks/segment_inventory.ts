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
const MINIMUM_SEGMENT_SIZE : number = 0.005;

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
const MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE : number = 0.4;

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
const MAX_MANIFEST_BUFFERED_DURATION_DIFFERENCE : number = 0.3;

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
  private _inventory : BufferedSegmentInfo[];

  constructor() {
    this._inventory = [];
  }

  /**
   * Reset the whole inventory.
   */
  reset() {
    this._inventory.length = 0;
  }

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
  synchronizeBuffered(buffered : TimeRanges) {
    const inventory = this._inventory;
    let inventoryIndex = 0; // Current index considered.
    let thisSegment = inventory[0]; // Current segmentInfos considered

    const rangesLength = buffered.length;
    for (let i = 0; i < rangesLength; i++) {
      if (thisSegment === undefined) { // we arrived at the end of our inventory
        return;
      }

      // take the i'nth contiguous buffered TimeRange
      const rangeStart = buffered.start(i);
      const rangeEnd = buffered.end(i);
      if (rangeEnd - rangeStart < MINIMUM_SEGMENT_SIZE) {
        console.warn("SI: skipped TimeRange when synchronizing because it was too small",
                     rangeStart, rangeEnd);
        continue;
      }

      const indexBefore = inventoryIndex; // keep track of that number

      // Find the first segment either within this TimeRange or completely past
      // it:
      // skip until first segment with at least `MINIMUM_SEGMENT_SIZE` past the
      // start of that range.
      while (thisSegment !== undefined &&
             (takeFirstSet(thisSegment.bufferedEnd, thisSegment.end)
               - rangeStart) < MINIMUM_SEGMENT_SIZE)
      {
        thisSegment = inventory[++inventoryIndex];
      }

      // Contains infos about the last garbage-collected segment before
      // `thisSegment`.
      let lastDeletedSegmentInfos = null;

      // remove garbage-collected segments
      // (Those not in that TimeRange nor in the previous one)
      const numberOfSegmentToDelete = inventoryIndex - indexBefore;
      if (numberOfSegmentToDelete > 0) {
        const lastDeletedSegment = // last garbage-collected segment
          inventory[indexBefore + numberOfSegmentToDelete - 1];

        lastDeletedSegmentInfos = {
          end: takeFirstSet(lastDeletedSegment.bufferedEnd,
                                    lastDeletedSegment.end),
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
            >= MINIMUM_SEGMENT_SIZE
      ) {
        guessBufferedStartFromRangeStart(thisSegment,
                                         rangeStart,
                                         lastDeletedSegmentInfos);

        if (inventoryIndex === inventory.length - 1) {
          // This is the last segment in the inventory.
          // We can directly update the end as the end of the current range.
          guessBufferedEndFromRangeEnd(thisSegment, rangeEnd);
          return;
        }

        thisSegment = inventory[++inventoryIndex];

        // Make contiguous until first segment outside that range
        let thisSegmentStart = takeFirstSet(thisSegment.bufferedStart,
                                            thisSegment.start);
        let thisSegmentEnd =  takeFirstSet(thisSegment.bufferedEnd,
                                                   thisSegment.end);
        const nextRangeStart = i < rangesLength - 1 ? buffered.start(i + 1) :
                                                      undefined;
        while (thisSegment !== undefined &&
               (rangeEnd - thisSegmentStart) >= MINIMUM_SEGMENT_SIZE &&
               (nextRangeStart === undefined ||
                 rangeEnd - thisSegmentStart >= thisSegmentEnd - nextRangeStart))
        {
          const prevSegment = inventory[inventoryIndex - 1];

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
            thisSegmentStart = takeFirstSet(thisSegment.bufferedStart,
                                                    thisSegment.start);
            thisSegmentEnd =  takeFirstSet(thisSegment.bufferedEnd,
                                                   thisSegment.end);
          }
        }
      }

      // update the bufferedEnd of the last segment in that range
      const lastSegmentInRange = inventory[inventoryIndex - 1];
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
  }

  /**
   * Add a new chunk in the inventory.
   *
   * Chunks are decodable sub-parts of a whole segment. Once all chunks in a
   * segment have been inserted, you should call the `completeSegment` method.
   * @param {Object} chunkInformation
   */
  insertChunk(start : number, end : number, representationInfo : RepresentationInfo) {
    if (start >= end) {
      console.warn("SI: Invalid chunked inserted: starts before it ends",
               start, end);
      return;
    }

    const inventory = this._inventory;
    const newSegment = {
      splitted: false,
      start,
      end,
      precizeStart: false,
      precizeEnd: false,
      bufferedStart: undefined,
      bufferedEnd: undefined,
      representationInfo,
    };

    // begin by the end as in most use cases this will be faster
    for (let i = inventory.length - 1; i >= 0; i--) {
      const segmentI = inventory[i];

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
        } else {
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
            } else {
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
          } else {
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
            } else {
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
              const nextSegment = { splitted: true,
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
    const firstSegment = this._inventory[0];
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
    } else if (firstSegment.end <= end) {
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
    } else {
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
  }

  /**
   * Returns the whole inventory.
   *
   * To get a list synchronized with what a media buffer actually has buffered
   * you might want to call `synchronizeBuffered` before calling this method.
   * @returns {Array.<Object>}
   */
  getInventory() {
    return this._inventory;
  }
}

/**
 * Returns `true` if the buffered start of the given chunk looks coherent enough
 * relatively to what is announced in the Manifest.
 * @param {Object} thisSegment
 * @returns {Boolean}
 */
function bufferedStartLooksCoherent(thisSegment : BufferedSegmentInfo) : boolean {
  if (thisSegment.bufferedStart === undefined) {
    return false;
  }
  const { start, end } = thisSegment;
  const duration = end - start;
  return Math.abs(start - thisSegment.bufferedStart) <=
           MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE &&
         (thisSegment.bufferedEnd === undefined ||
           thisSegment.bufferedEnd > thisSegment.bufferedStart &&
           Math.abs(thisSegment.bufferedEnd - thisSegment.bufferedStart -
             duration) <= Math.min(MAX_MANIFEST_BUFFERED_DURATION_DIFFERENCE,
                                   duration / 3));
}

/**
 * Returns `true` if the buffered end of the given chunk looks coherent enough
 * relatively to what is announced in the Manifest.
 * @param {Object} thisSegment
 * @returns {Boolean}
 */
function bufferedEndLooksCoherent(thisSegment : BufferedSegmentInfo) : boolean {
  if (thisSegment.bufferedEnd === undefined) {
    return false;
  }
  const { start, end } = thisSegment;
  const duration = end - start;
  return Math.abs(end - thisSegment.bufferedEnd) <=
           MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE &&
         thisSegment.bufferedStart != null &&
         thisSegment.bufferedEnd > thisSegment.bufferedStart &&
         Math.abs(thisSegment.bufferedEnd - thisSegment.bufferedStart -
           duration) <= Math.min(MAX_MANIFEST_BUFFERED_DURATION_DIFFERENCE,
                                 duration / 3);
}

/**
 * Evaluate the given buffered Chunk's buffered start from its range's start,
 * considering that this chunk is the first one in it.
 * @param {Object} firstSegmentInRange
 * @param {number} rangeStart
 * @param {Object} lastDeletedSegmentInfos
 */
function guessBufferedStartFromRangeStart(
  firstSegmentInRange : BufferedSegmentInfo,
  rangeStart : number,
  lastDeletedSegmentInfos : { end : number; precizeEnd : boolean } |
                            null,
) {
  if (firstSegmentInRange.bufferedStart !== undefined) {
    if (firstSegmentInRange.bufferedStart < rangeStart) {
      // console.debug("SI: Segment partially GCed at the start",
      //               firstSegmentInRange.bufferedStart, rangeStart);
      firstSegmentInRange.bufferedStart = rangeStart;
    }
    if (!firstSegmentInRange.precizeStart &&
        bufferedStartLooksCoherent(firstSegmentInRange))
    {
      firstSegmentInRange.start = firstSegmentInRange.bufferedStart;
      firstSegmentInRange.precizeStart = true;
    }
  } else if (firstSegmentInRange.precizeStart) {
    // console.debug("SI: buffered start is precize start",
    //               firstSegmentInRange.start);
    firstSegmentInRange.bufferedStart = firstSegmentInRange.start;
  } else if (lastDeletedSegmentInfos !== null &&
             lastDeletedSegmentInfos.end > rangeStart &&
               (lastDeletedSegmentInfos.precizeEnd ||
                firstSegmentInRange.start - lastDeletedSegmentInfos.end <=
                  MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE))
  {
    // console.debug("SI: buffered start is end of previous segment",
    //               rangeStart,
    //               firstSegmentInRange.start,
    //               lastDeletedSegmentInfos.end);
    firstSegmentInRange.bufferedStart = lastDeletedSegmentInfos.end;
    if (bufferedStartLooksCoherent(firstSegmentInRange)) {
      firstSegmentInRange.start = lastDeletedSegmentInfos.end;
      firstSegmentInRange.precizeStart = true;
    }
  } else if (firstSegmentInRange.start - rangeStart <=
               MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE)
  {
    // console.debug("SI: found true buffered start",
    //               rangeStart, firstSegmentInRange.start);
    firstSegmentInRange.bufferedStart = rangeStart;
    if (bufferedStartLooksCoherent(firstSegmentInRange)) {
      firstSegmentInRange.start = rangeStart;
      firstSegmentInRange.precizeStart = true;
    }
  } else if (rangeStart < firstSegmentInRange.start) {
    // console.debug("SI: range start too far from expected start",
    //               rangeStart, firstSegmentInRange.start);
  } else {
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
function guessBufferedEndFromRangeEnd(
  lastSegmentInRange : BufferedSegmentInfo,
  rangeEnd : number
) {
  if (lastSegmentInRange.bufferedEnd !== undefined) {
    if (lastSegmentInRange.bufferedEnd > rangeEnd) {
      // console.debug("SI: Segment partially GCed at the end",
      //               lastSegmentInRange.bufferedEnd, rangeEnd);
      lastSegmentInRange.bufferedEnd = rangeEnd;
    }
    if (!lastSegmentInRange.precizeEnd &&
        rangeEnd - lastSegmentInRange.end <= MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE &&
        bufferedEndLooksCoherent(lastSegmentInRange))
    {
      lastSegmentInRange.precizeEnd = true;
      lastSegmentInRange.end = rangeEnd;
    }
  } else if (lastSegmentInRange.precizeEnd) {
    // console.debug("SI: buffered end is precize end",
    //               lastSegmentInRange.end);
    lastSegmentInRange.bufferedEnd = lastSegmentInRange.end;
  } else if (rangeEnd - lastSegmentInRange.end <=
               MAX_MANIFEST_BUFFERED_START_END_DIFFERENCE)
  {
    // console.debug("SI: found true buffered end",
    //               rangeEnd, lastSegmentInRange.end);
    lastSegmentInRange.bufferedEnd = rangeEnd;
    if (bufferedEndLooksCoherent(lastSegmentInRange)) {
      lastSegmentInRange.end = rangeEnd;
      lastSegmentInRange.precizeEnd = true;
    }
  } else if (rangeEnd > lastSegmentInRange.end) {
    // console.debug("SI: range end too far from expected end",
    //               rangeEnd, lastSegmentInRange.end);
    lastSegmentInRange.bufferedEnd = lastSegmentInRange.end;
  } else {
    // console.debug("SI: Segment appears immediately garbage collected at the end",
    //               lastSegmentInRange.bufferedEnd, rangeEnd);
    lastSegmentInRange.bufferedEnd = rangeEnd;
  }
}


/**
 * Returns the first argument given different from undefined or null.
 * @param {...*} args
 * @returns {*}
 */
function takeFirstSet<T>(
  a : undefined | null | T,
  b : T
) : T;
function takeFirstSet<T>(
  a : T,
  b? : undefined | null | T
) : T;
function takeFirstSet<T>(a : T | undefined | null, b : T) : T;
function takeFirstSet(
  a? : undefined|null,
  b? : undefined|null
) : undefined;
function takeFirstSet<T>(...args : Array<T|null|undefined>) : T |
                                                                             undefined;
function takeFirstSet<T>(
  ...args : Array<T|null|undefined>
) : T | undefined {
  let i = 0;
  const len = args.length;
  while (i < len) {
    const arg = args[i];
    if (arg != null) {
      return arg;
    }
    i++;
  }
  return undefined;
}

/** Information stored on a single chunk by the SegmentInventory. */
export interface BufferedSegmentInfo {
  /**
   * Last inferred end in the media buffer this chunk ends at, in seconds.
   *
   * Depending on if contiguous chunks were around it during the first
   * synchronization for that chunk this value could be more or less precize.
   */
  bufferedEnd : number|undefined;
  /**
   * Last inferred start in the media buffer this chunk starts at, in seconds.
   *
   * Depending on if contiguous chunks were around it during the first
   * synchronization for that chunk this value could be more or less precize.
   */
  bufferedStart : number|undefined;
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
  end : number;
  /**
   * If `true` the `end` property is an estimate the `SegmentInventory` has
   * a high confidence in.
   * In that situation, `bufferedEnd` can easily be compared to it to check if
   * that segment has been partially, or fully, garbage collected.
   *
   * If `false`, it is just a guess based on segment information.
   */
  precizeEnd : boolean;
  /**
   * If `true` the `start` property is an estimate the `SegmentInventory` has
   * a high confidence in.
   * In that situation, `bufferedStart` can easily be compared to it to check if
   * that segment has been partially, or fully, garbage collected.
   *
   * If `false`, it is just a guess based on segment information.
   */
  precizeStart : boolean;
  /**
   * If `true`, the segment as a whole is divided into multiple parts in the
   * buffer, with other segment(s) between them.
   * If `false`, it is contiguous.
   *
   * Splitted segments are a rare occurence that is more complicated to handle
   * than contiguous ones.
   */
  splitted : boolean;
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
  start : number; // Supposed start the segment should start from, in seconds

  representationInfo: RepresentationInfo;
}

export interface RepresentationInfo {
  representationId: string;
  type?: "audio"|"video";
  width?: number;
  height?: number;
  timescale?: number;
}
