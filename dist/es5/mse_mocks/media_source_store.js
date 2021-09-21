import { getDurationFromSegmentSidx, getDurationFromTrun, getMDHDTimescale, getTrackFragmentDecodeTime, getWidthAndHeight, isISOBMFFInitSegment, isISOBMFFMediaSegment, } from "../parsing/isobmff_parsing";
import { hashBuffer } from "../utils";
import SegmentInventory from "./segment_inventory";
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
export default MediaSourceStore;
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
export { MediaSourceReference };
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
export { SourceBufferReference };
