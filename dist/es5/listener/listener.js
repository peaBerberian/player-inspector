import { mediaSourceStore, } from "../mse_mocks/index";
import TaskCanceller from "../task_canceller";
import { noop } from "../utils";
var MAXIMUM_ITV_POLLING = 200;
/** HTMLMediaElement Events for which playback information is polled. */
var SCANNED_MEDIA_ELEMENTS_EVENTS = ["canplay",
    "play",
    "seeking",
    "seeked",
    "loadedmetadata",
    "ratechange",
    "ended"];
export default function startListening(args) {
    var canceller = new TaskCanceller();
    var cancelSignal = canceller.signal;
    var mediaElement = args.mediaElement;
    var baseTimestamp = performance.now();
    var stalledTimestamps = [];
    var endedTimestamps = [];
    var regularPollingItems = [];
    var readyStates = [{
            timestamp: baseTimestamp,
            readyState: mediaElement.readyState,
        }];
    var seekOperations = [];
    var playbackRateOperations = [];
    var removeEventListeners = [];
    var pollingTimeout;
    var taskTimeout;
    var resolveTask = noop;
    var task = new Promise(function (res) {
        resolveTask = res;
        cancelSignal.register(freeResources);
        if (typeof args.timeout === "number") {
            taskTimeout = setTimeout(function () {
                freeResources();
                res(generateResultObject());
            }, args.timeout);
        }
        SCANNED_MEDIA_ELEMENTS_EVENTS.map(function (eventName) {
            mediaElement.addEventListener(eventName, onCurrentEvent);
            removeEventListeners.push(function () {
                mediaElement.removeEventListener(eventName, onCurrentEvent);
            });
            function onCurrentEvent() {
                clearTimeout(pollingTimeout);
                pollingTimeout = setTimeout(onTimeout, MAXIMUM_ITV_POLLING);
                var timestamp = performance.now();
                if (eventName === "ended") {
                    if (args.finishAtEnd === true) {
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
        function freeResources() {
            clearTimeout(taskTimeout);
            clearTimeout(pollingTimeout);
            for (var _i = 0, removeEventListeners_1 = removeEventListeners; _i < removeEventListeners_1.length; _i++) {
                var removeEventListener_1 = removeEventListeners_1[_i];
                removeEventListener_1();
            }
        }
    });
    return { task: task, finish: finish };
    /**
     * Finish current listening task and emit all stored playback metrics.
     * @returns {Object}
     */
    function finish() {
        canceller.cancel();
        var res = generateResultObject();
        resolveTask(res);
        return res;
    }
    /**
     * Generate object grouping all playback metrics.
     * @returns {Object}
     */
    function generateResultObject() {
        var sourceBuffers = getLinkedSourceBuffers(mediaElement);
        return {
            baseTimestamp: baseTimestamp,
            timestamps: {
                stalled: stalledTimestamps,
                ended: endedTimestamps,
            },
            readyStates: readyStates,
            seekOperations: seekOperations,
            playbackRateOperations: playbackRateOperations,
            regularPolling: regularPollingItems,
            sourceBuffersOperations: sourceBuffers.map(function (sb) {
                return {
                    mimeType: sb.mimeType,
                    removed: sb.removed,
                    appended: sb.appended,
                };
            }),
        };
    }
    function pollForEvent(eventName, timestamp) {
        var _a;
        var lastReadyState = (_a = readyStates[readyStates.length - 1]) === null || _a === void 0 ? void 0 : _a.readyState;
        if (lastReadyState !== mediaElement.readyState) {
            readyStates.push({
                timestamp: timestamp,
                readyState: mediaElement.readyState,
            });
        }
        switch (eventName) {
            case "stalled":
                stalledTimestamps.push(timestamp);
                ;
                break;
            case "seeking":
                seekOperations.push({
                    seekingTimestamp: timestamp,
                    newTime: mediaElement.currentTime,
                });
                break;
            case "seeked":
                var lastSeekOp = seekOperations[seekOperations.length - 1];
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
        var currentState = pollNormalPlayback(mediaElement, eventName, timestamp);
        regularPollingItems.push(currentState);
    }
}
function pollNormalPlayback(mediaElement, reason, timestamp) {
    var buffered = mediaElement.buffered, currentTime = mediaElement.currentTime;
    var bufferGap = 0;
    for (var i = 0; i < buffered.length; i++) {
        if (currentTime >= buffered.start(i)) {
            if (currentTime < buffered.end(i)) {
                bufferGap = buffered.end(i) - currentTime;
            }
            break;
        }
    }
    var sourceBuffers = getLinkedSourceBuffers(mediaElement);
    var currentSegmentInfo = sourceBuffers.map(function (sb) {
        var currentSegment = null;
        var inventory = sb.segmentInventory.getInventory();
        for (var i = inventory.length - 1; i >= 0; i--) {
            var seg = inventory[i];
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
        return { mimeType: sb.mimeType, currentSegment: currentSegment };
    });
    return { reason: reason, currentTime: currentTime, bufferGap: bufferGap, currentSegmentInfo: currentSegmentInfo, timestamp: timestamp };
}
function getLinkedSourceBuffers(mediaElement) {
    var msStored = mediaSourceStore.getStored();
    var hasFound = false;
    var sourceBuffers = [];
    for (var _i = 0, msStored_1 = msStored; _i < msStored_1.length; _i++) {
        var msInfo = msStored_1[_i];
        if (msInfo.urls.includes(mediaElement.src)) {
            hasFound = true;
            sourceBuffers.push.apply(sourceBuffers, msInfo.sourceBuffers);
        }
    }
    if (!hasFound) {
        for (var _a = 0, msStored_2 = msStored; _a < msStored_2.length; _a++) {
            var msInfo = msStored_2[_a];
            if (msInfo.revokedUrls.includes(mediaElement.src)) {
                hasFound = true;
                sourceBuffers.push.apply(sourceBuffers, msInfo.sourceBuffers);
            }
        }
    }
    return sourceBuffers;
}
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
