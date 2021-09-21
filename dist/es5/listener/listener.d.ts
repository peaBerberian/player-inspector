import { AddedSegmentItem, RemovedItem } from "../mse_mocks/index";
export interface PlaybackMetrics {
    baseTimestamp: number;
    timestamps: {
        ended: number[];
        stalled: number[];
    };
    readyStates: ReadyStateChangeInfo[];
    seekOperations: SeekOperationInfo[];
    playbackRateOperations: PlaybackRateOperationInfo[];
    regularPolling: RegularPollingPlaybackInfo[];
    sourceBuffersOperations: SourceBufferOperationInfo[];
}
export interface SeekOperationInfo {
    seekingTimestamp: number;
    seekedTimestamp?: number;
    newTime: number;
}
export interface PlaybackRateOperationInfo {
    timestamp: number;
    newPlaybackRate: number;
}
export interface ReadyStateChangeInfo {
    readyState: number;
    timestamp: number;
}
export interface SourceBufferOperationInfo {
    mimeType: string;
    appended: AddedSegmentItem[];
    removed: RemovedItem[];
}
export interface ListeningArguments {
    mediaElement: HTMLMediaElement;
    timeout?: number;
    finishAtEnd?: boolean;
}
export default function startListening(args: ListeningArguments): {
    finish: () => PlaybackMetrics;
    task: Promise<PlaybackMetrics>;
};
interface RegularPollingPlaybackInfo {
    reason: PollReason;
    currentTime: number;
    bufferGap: number;
    timestamp: number;
    currentSegmentInfo: Array<{
        mimeType: string;
        currentSegment: null | {
            start: number;
            end: number;
            bufferedStart?: number | undefined;
            bufferedEnd?: number | undefined;
            representationId: string;
            type?: "audio" | "video" | undefined;
            width?: number | undefined;
            height?: number | undefined;
        };
    }>;
}
export declare type PollReason = 
/** First polling done. */
"init" | // set once on first emit
/** Regular poll when no event happened in a long time. */
"timeupdate" | 
/** On the HTML5 event with the same name */
"canplay" | 
/** On the HTML5 event with the same name */
"canplaythrough" | // HTML5 Event
/** On the HTML5 event with the same name */
"play" | 
/** On the HTML5 event with the same name */
"seeking" | 
/** On the HTML5 event with the same name */
"seeked" | 
/** On the HTML5 event with the same name */
"stalled" | 
/** On the HTML5 event with the same name */
"loadedmetadata" | 
/** On the HTML5 event with the same name */
"loadeddata" | 
/** On the HTML5 event with the same name */
"ratechange" | 
/** On the HTML5 event with the same name */
"ended";
export {};
