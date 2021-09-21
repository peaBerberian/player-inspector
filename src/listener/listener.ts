import {
  AddedSegmentItem,
  mediaSourceStore,
  RemovedItem,
  SourceBufferItem,
} from "../mse_mocks/index";
import TaskCanceller from "../task_canceller";
import { noop } from "../utils";

const MAXIMUM_ITV_POLLING = 200;

/** HTMLMediaElement Events for which playback information is polled. */
const SCANNED_MEDIA_ELEMENTS_EVENTS : PollReason[] = [ "canplay",
                                                       "play",
                                                       "seeking",
                                                       "seeked",
                                                       "loadedmetadata",
                                                       "ratechange",
                                                       "ended" ];

export interface PlaybackMetrics {
  baseTimestamp: number;
  timestamps: {
    ended: number[];
    stalled: number[];
  }
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

export default function startListening(
  args: ListeningArguments
): {
  finish: () => PlaybackMetrics;
  task: Promise<PlaybackMetrics>;
} {
  const canceller = new TaskCanceller();
  const cancelSignal = canceller.signal;
  const { mediaElement } = args;
  const baseTimestamp = performance.now();
  const stalledTimestamps: number[] = [];
  const endedTimestamps: number[] = [];
  const regularPollingItems: RegularPollingPlaybackInfo[] = [];
  const readyStates: ReadyStateChangeInfo[] = [{
    timestamp: baseTimestamp,
    readyState: mediaElement.readyState,
  }];
  const seekOperations: SeekOperationInfo[] = [];
  const playbackRateOperations: PlaybackRateOperationInfo[] = [];
  const removeEventListeners : Array<() => void> = [];
  let pollingTimeout: number | undefined;
  let taskTimeout: number | undefined;

  let resolveTask: (res: PlaybackMetrics) => void = noop;
  const task = new Promise<PlaybackMetrics>((res) => {
    resolveTask = res;
    cancelSignal.register(freeResources);
    if (typeof args.timeout === "number") {
      taskTimeout = setTimeout(() => {
        freeResources();
        res(generateResultObject());
      }, args.timeout);
    }
    SCANNED_MEDIA_ELEMENTS_EVENTS.map((eventName) => {
      mediaElement.addEventListener(eventName, onCurrentEvent);
      removeEventListeners.push(() => {
        mediaElement.removeEventListener(eventName, onCurrentEvent);
      });
      function onCurrentEvent() {
        clearTimeout(pollingTimeout);
        pollingTimeout = setTimeout(onTimeout, MAXIMUM_ITV_POLLING);

        const timestamp = performance.now();
        if (eventName === "ended") {
          if (args.finishAtEnd === true)  {
            clearTimeout(taskTimeout);
            endedTimestamps.push(timestamp);
            res(generateResultObject());
          }
          return;
        }

        pollForEvent(eventName, timestamp);

        function onTimeout() {
          pollForEvent("timeupdate", performance.now());
          pollingTimeout = setTimeout(onTimeout, MAXIMUM_ITV_POLLING);
        }
      }
    });

    /**
     * Clean-up all timeouts and event listeners linked to this task.
     */
    function freeResources(): void {
      clearTimeout(taskTimeout);
      clearTimeout(pollingTimeout);
      for (const removeEventListener of removeEventListeners) {
        removeEventListener();
      }
    }
  });
  return { task, finish };

  /**
   * Finish current listening task and emit all stored playback metrics.
   * @returns {Object}
   */
  function finish(): PlaybackMetrics {
    canceller.cancel();
    const res = generateResultObject();
    resolveTask(res);
    return res;
  }

  /**
   * Generate object grouping all playback metrics.
   * @returns {Object}
   */
  function generateResultObject(): PlaybackMetrics {
    const sourceBuffers = getLinkedSourceBuffers(mediaElement);
    return {
      baseTimestamp: baseTimestamp,
      timestamps: {
        stalled: stalledTimestamps,
        ended: endedTimestamps,
      },
      readyStates,
      seekOperations,
      playbackRateOperations,
      regularPolling: regularPollingItems,

      sourceBuffersOperations: sourceBuffers.map(sb => {
        return {
          mimeType: sb.mimeType,
          removed: sb.removed,
          appended: sb.appended,
        };
      }),
    };
  }

  function pollForEvent(eventName: PollReason, timestamp: number) {
    const lastReadyState = readyStates[readyStates.length - 1]?.readyState;
    if (lastReadyState !== mediaElement.readyState) {
      readyStates.push({
        timestamp,
        readyState: mediaElement.readyState,
      });
    }
    switch (eventName) {
      case "stalled":
        stalledTimestamps.push(timestamp);;
        break;
      case "seeking":
        seekOperations.push({
          seekingTimestamp: timestamp,
          newTime: mediaElement.currentTime,
        });
        break;
      case "seeked":
        const lastSeekOp = seekOperations[seekOperations.length - 1];
        if (lastSeekOp !== undefined && lastSeekOp.seekedTimestamp === undefined) {
          lastSeekOp.seekedTimestamp = timestamp;
        }
        break;
      case "ratechange":
        playbackRateOperations.push({
          timestamp: timestamp,
          newPlaybackRate: mediaElement.playbackRate,
        });
        break;
    }
    const currentState = pollNormalPlayback(mediaElement, eventName, timestamp);
    regularPollingItems.push(currentState);
  }
}

function pollNormalPlayback(
  mediaElement: HTMLMediaElement,
  reason: PollReason,
  timestamp: number
) : RegularPollingPlaybackInfo {
  const { buffered, currentTime } = mediaElement;
  let bufferGap = 0;
  for (let i = 0; i < buffered.length; i++) {
    if (currentTime >= buffered.start(i)) {
      if (currentTime < buffered.end(i)) {
        bufferGap = buffered.end(i) - currentTime;
      }
      break;
    }
  }
  const sourceBuffers = getLinkedSourceBuffers(mediaElement);
  const currentSegmentInfo = sourceBuffers.map(sb => {
    let currentSegment = null;
    const inventory = sb.segmentInventory.getInventory();
    for (let i = inventory.length - 1; i >= 0; i--) {
      const seg = inventory[i];
      // TODO fallback on start / end?
      if (seg.bufferedStart !== undefined && seg.bufferedEnd !== undefined) {
        if (currentTime >= seg.bufferedStart) {
          if (currentTime < seg.bufferedEnd) {
            currentSegment = {
              start: seg.start,
              end: seg.end,
              bufferedStart: seg.bufferedStart,
              bufferedEnd: seg.bufferedEnd,
              representationId: seg.representationInfo.representationId,
              type: seg.representationInfo.type,
              width: seg.representationInfo.width,
              height: seg.representationInfo.height,
            };
          }
          break;
        }
      }
    }
    return { mimeType: sb.mimeType, currentSegment };
  });

  return { reason, currentTime, bufferGap, currentSegmentInfo, timestamp };
}

function getLinkedSourceBuffers(
  mediaElement: HTMLMediaElement
): SourceBufferItem[] {
  const msStored = mediaSourceStore.getStored();
  let hasFound = false;
  let sourceBuffers = [];
  for (const msInfo of msStored) {
    if (msInfo.urls.includes(mediaElement.src)) {
      hasFound = true;
      sourceBuffers.push(...msInfo.sourceBuffers);
    }
  }
  if (!hasFound) {
    for (const msInfo of msStored) {
      if (msInfo.revokedUrls.includes(mediaElement.src)) {
        hasFound = true;
        sourceBuffers.push(...msInfo.sourceBuffers);
      }
    }
  }
  return sourceBuffers;
}

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

export type PollReason =
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

// Courbe current time en fonction du timestamp
// Courbe bufferGap en fonction du timestamp
// Courbe qualité vidéo en fonction du timestamp?
//
// Nombre de rebufferings (a definir)
// Durée moyen d'un rebuffering
// Durée depuis load jusqu'a lecture (a definir)
// Nombre video quality switch
// Nombre audio quality switch
//
// Sur chacun des graph:
//   traits pour rebuffering et load time?


// function getProbableCurrentMediaElement() : HTMLMediaElement | null {
//   const mediaElts = document.getElementsByTagName("video");
//   let currentElt : HTMLMediaElement | null = null;
//   let maxSize = 0;
//   for (let i = mediaElts.length - 1; i >= 0; i--) {
//     const resolution = mediaElts[i].width * mediaElts[i].height;
//     if (resolution > maxSize) {
//       maxSize = resolution;
//       currentElt = mediaElts[i];
//     }
//   }
//   return currentElt;
// }

// function checkVideoElementIsStillHere(mediaElement : HTMLMediaElement) : boolean {
//   const mediaElts = document.getElementsByTagName("video");
//   for (let i = mediaElts.length - 1; i >= 0; i--) {
//     if (mediaElts[i] === mediaElement) {
//       return true;
//     }
//   }
//   return false;
// }

// function pollMediaElement(
//   cancelSignal : CancellationSignal
// ) : Promise<HTMLMediaElement> {
//   return new Promise((res, rej) => {
//     let cleanTimeout = noop;
//     const timeout = setTimeout(() => {
//       cleanTimeout();
//       const currentVideoElement = getProbableCurrentMediaElement();
//       if (currentVideoElement === null) {
//         return pollMediaElement(cancelSignal);
//       }
//       res(currentVideoElement);
//     }, TIMEOUT_LOOK_FOR_VIDEO_ELT);
//     cleanTimeout = cancelSignal.register((err) => {
//       window.clearTimeout(timeout);
//       rej(err);
//     });
//   });
// }
// import { noop } from "../utils";
// const TIMEOUT_LOOK_FOR_VIDEO_ELT = 50;
