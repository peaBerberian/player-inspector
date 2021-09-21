import MediaSourceStore from "./media_source_store";

const mediaSourceStore = new MediaSourceStore();
export { mediaSourceStore };

const originalMediaSource = window.MediaSource;

export default function startMockingMediaSource() {
  function MediaSourceMock(...args : any) {
    const realMediaSource = new originalMediaSource(...args as []);
    const mediaSourceRef = mediaSourceStore.addMediaSource(realMediaSource);
    realMediaSource.addSourceBuffer = function(...args) {
      const mimeType = args[0];
      if (typeof mimeType !== "string") {
        console.warn("Invalid MediaSource constructed, ignoring...");
        return realMediaSource.addSourceBuffer(...args);
      }
      const realSourceBuffer =
        originalMediaSource.prototype.addSourceBuffer.apply(realMediaSource, args);

      const sourceBufferRef = mediaSourceRef.addSourceBuffer(realSourceBuffer, mimeType)
      realSourceBuffer.addEventListener("update", function () {
        sourceBufferRef.synchronize();
      });

      realSourceBuffer.appendBuffer = function () {
        const data = arguments[0];
        if (data == null ||
            (!(data instanceof ArrayBuffer) &&
             !((data as any).buffer instanceof ArrayBuffer)))
        {
          console.warn("Invalid SourceBuffer.appendBuffer call, ignoring...");
        } else {
          sourceBufferRef.appendSegment(data);
        }
        return SourceBuffer.prototype.appendBuffer.apply(this, arguments as any);
      };

      realSourceBuffer.remove = function () {
        const start = arguments[0];
        const end = arguments[1];
        if (typeof start !== "number" || typeof end !== "number") {
          console.warn("Invalid SourceBuffer.remove call, ignoring...");
        } else {
          sourceBufferRef.removeSegment(start, end);
        }
        return (SourceBuffer.prototype.remove as any).apply(this, arguments as any);
      };
      return realSourceBuffer;
    };
    return realMediaSource;
  }

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  URL.createObjectURL = function (...args: any[]) : string {
    const url = (originalCreateObjectURL as any)(...args);
    const obj = args[0];
    if (obj instanceof MediaSource) {
      const msReferences = mediaSourceStore.getReferences(obj);
      for (const msReference of msReferences) {
        msReference.addUrl(url);
      }
    }
    return url;
  }
  URL.revokeObjectURL = function (...args: any) : string {
    const url = args[0];
    const msReferences = mediaSourceStore.getAllReferences();
    for (const msReference of msReferences) {
      msReference.revokeUrl(url);
    }
    return (originalRevokeObjectUrl as any)(...args);
  }

  const propDesc = Object.getOwnPropertyDescriptors(MediaSource);
  Object.defineProperties(MediaSourceMock, propDesc);
  (window as any).MediaSource = MediaSourceMock;
  (window as any).MediaSource.isMocked = true;
}
