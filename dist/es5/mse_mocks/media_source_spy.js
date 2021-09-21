var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import MediaSourceStore from "./media_source_store";
var mediaSourceStore = new MediaSourceStore();
export { mediaSourceStore };
var originalMediaSource = window.MediaSource;
export default function startMockingMediaSource() {
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
