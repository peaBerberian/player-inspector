import SegmentInventory from "./segment_inventory";
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
    appendWindows: [number | undefined, number | undefined];
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
    private _stored;
    constructor();
    getStored(): MediaSourceStoreItem[];
    addMediaSource(ms: MediaSource): MediaSourceReference;
    getReferences(ms: MediaSource): MediaSourceReference[];
    getAllReferences(): MediaSourceReference[];
}
export declare class MediaSourceReference {
    private _wrapped;
    constructor(item: MediaSourceStoreItem);
    addSourceBuffer(sb: SourceBuffer, mimeType: string): SourceBufferReference;
    addUrl(url: string): void;
    revokeUrl(url: string): void;
}
export declare class SourceBufferReference {
    private _wrapped;
    private _lastInitTimescale;
    private _lastInitHash;
    private _representationInfo;
    constructor(item: SourceBufferItem);
    appendSegment(data: BufferSource): void;
    removeSegment(start: number, end: number): void;
    synchronize(): void;
}
