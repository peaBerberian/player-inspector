import {
  getDurationFromSegmentSidx,
  getDurationFromTrun,
  getMDHDTimescale,
  getTrackFragmentDecodeTime,
  getWidthAndHeight,
  isISOBMFFInitSegment,
  isISOBMFFMediaSegment,
} from "../parsing/isobmff_parsing";
import {hashBuffer} from "../utils";
import SegmentInventory, {
  RepresentationInfo,
} from "./segment_inventory";

export interface MediaSourceStoreItem {
  createdAt: number;
  sourceBuffers: SourceBufferItem[];
  instance: MediaSource;
  urls: string[];
  revokedUrls: string[];
}

export interface SourceBufferItem {
  createdAt: number;
  instance: SourceBuffer;
  segmentInventory: SegmentInventory;
  mimeType: string;
  appended: AddedSegmentItem[];
  removed: RemovedItem[];
}

export interface AddedSegmentItem {
  addedAt: number;
  appendWindows: [number|undefined, number|undefined];
  byteSize?: number;
  isISOBMFFMediaSegment: boolean;
  isISOBMFFInitSegment: boolean;
  decodeTime?: number;
  duration?: number;
  width?: number;
  height?: number;
}

export interface RemovedItem {
  removedAt: number;
  start: number;
  end: number;
}

export default class MediaSourceStore {
  private _stored: MediaSourceStoreItem[];
  constructor() {
    this._stored = [];
  }

  public getStored(): MediaSourceStoreItem[] {
    return this._stored;
  }

  public addMediaSource(ms: MediaSource): MediaSourceReference {
    const newMsItem: MediaSourceStoreItem = {
      createdAt: performance.now(),
      sourceBuffers: [],
      instance: ms,
      urls: [],
      revokedUrls: [],
    };
    this._stored.push(newMsItem);
    return new MediaSourceReference(newMsItem);
  }

  public getReferences(ms: MediaSource): MediaSourceReference[] {
    return this._stored.reduce((acc: MediaSourceReference[], s) => {
      if (s.instance === ms) {
        acc.push(new MediaSourceReference(s));
      }
      return acc;
    }, []);
  }

  public getAllReferences(): MediaSourceReference[] {
    return this._stored.map((s) => {
      return new MediaSourceReference(s);
    }, []);
  }
}

export class MediaSourceReference {
  private _wrapped: MediaSourceStoreItem;

  constructor(item: MediaSourceStoreItem) {
    this._wrapped = item;
  }

  public addSourceBuffer(
    sb: SourceBuffer,
    mimeType: string
  ): SourceBufferReference {
    const segmentInventory = new SegmentInventory();
    const newSbItem: SourceBufferItem = {
      instance: sb,
      createdAt: performance.now(),
      mimeType,
      appended: [],
      removed: [],
      segmentInventory,
    };
    this._wrapped.sourceBuffers.push(newSbItem);
    return new SourceBufferReference(newSbItem);
  }

  public addUrl(url: string): void {
    this._wrapped.urls.push(url);
  }

  public revokeUrl(url: string): void {
    while (true) {
      const indexOf = this._wrapped.urls.indexOf(url);
      if (indexOf < 0) {
          return;
      }
      this._wrapped.urls.splice(indexOf, 1);
      this._wrapped.revokedUrls.push(url);
    }
  }
}

export class SourceBufferReference {
  private _wrapped: SourceBufferItem;
  private _lastInitTimescale: number|undefined;
  private _lastInitHash: number|undefined;
  private _representationInfo: Partial<Record<string, RepresentationInfo>>;

  constructor(item: SourceBufferItem) {
    this._wrapped = item;
    this._lastInitTimescale = undefined;
    this._lastInitHash = undefined;
    this._representationInfo = {};
  }

  public appendSegment(
    data: BufferSource
  ) {
    const dataAb = data instanceof ArrayBuffer ? data : data.buffer;
    const byteSize = dataAb.byteLength;
    const isMp4Media = isISOBMFFMediaSegment(dataAb);
    const isMp4Init = isISOBMFFInitSegment(dataAb);
    const addedSegmentItem: AddedSegmentItem = {
      addedAt: performance.now(),
      appendWindows: [
        this._wrapped.instance.appendWindowStart,
        this._wrapped.instance.appendWindowEnd,
      ],
      byteSize,
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
      const uintData = data instanceof Uint8Array ?
        data :
        new Uint8Array(dataAb);
      this._lastInitTimescale = getMDHDTimescale(uintData);
      const hashed = hashBuffer(uintData);
      this._lastInitHash = hashed;
      const widthAndHeight = getWidthAndHeight(uintData);
      if (this._representationInfo[hashed] === undefined) {
        const newRepInfo: RepresentationInfo = { representationId: String(hashed) };
        if (widthAndHeight !== null) {
          newRepInfo.width = widthAndHeight[0];
          newRepInfo.height = widthAndHeight[1];
        }
        if (this._wrapped.mimeType.includes("video")) {
          newRepInfo.type = "video";
        } else if (this._wrapped.mimeType.includes("audio")) {
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
      const uintData = data instanceof Uint8Array ?
        data :
        new Uint8Array(dataAb);
      if (this._lastInitTimescale !== undefined) {
        const trafTime = getTrackFragmentDecodeTime(uintData);
        const decodeTime = trafTime !== undefined ?
          trafTime / this._lastInitTimescale :
          undefined;
        const trunDuration = getDurationFromTrun(uintData);
        const duration = trunDuration !== undefined ?
          trunDuration / this._lastInitTimescale :
          getDurationFromSegmentSidx(uintData);
        if (decodeTime !== undefined) {
          addedSegmentItem.decodeTime = decodeTime;
        }
        if (duration !== undefined) {
          addedSegmentItem.duration = duration;
        }
        const repInfo = this._lastInitHash === undefined ?
          undefined :
          this._representationInfo[this._lastInitHash];
        if (duration !== undefined &&
            decodeTime !== undefined &&
            repInfo !== undefined)
        {
          this._wrapped.segmentInventory.insertChunk(decodeTime,
                                                     decodeTime + duration,
                                                     repInfo);
        }
      }
    }
  }

  public removeSegment(start: number, end: number) {
    this._wrapped.removed.push({
      removedAt: performance.now(),
      start,
      end,
    });
  }

  public synchronize() {
    this._wrapped.segmentInventory.synchronizeBuffered(
      this._wrapped.instance.buffered
    );
  }
}
