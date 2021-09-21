import RequestStore from "./request_store";
var originalXhrOpen = XMLHttpRequest.prototype.open;
var requestStore = new RequestStore();
export { requestStore };
export default function startMockingXHR() {
    XMLHttpRequest.prototype.open = function () {
        var method = arguments[0];
        var url = arguments[1];
        if (typeof method !== "string" || typeof url !== "string") {
            console.warn("Invalid open call on XHR, fallbacking...");
            return originalXhrOpen.apply(this, arguments);
        }
        var requestRef = requestStore.open(method, url);
        this.addEventListener("load", function () {
            requestRef.loaded(this.status, this.getResponseHeader("content-type"), getSize(this.response, this.responseType));
        });
        this.addEventListener("error", function () {
            requestRef.failed(this.status, this.getResponseHeader("content-type"), getSize(this.response, this.responseType));
        });
        this.abort = function () {
            requestRef.aborted();
            return XMLHttpRequest.prototype.abort.apply(this, arguments);
        };
        this.send = function () {
            requestRef.send();
            return XMLHttpRequest.prototype.send.apply(this, arguments);
        };
        return originalXhrOpen.apply(this, arguments);
    };
}
function getSize(response, responseType) {
    switch (responseType) {
        case "blob":
            return response.size;
        case "arraybuffer":
            return response.byteLength;
        case "":
        case "text":
            return response.length * 2;
        default:
        // TODO what if document / json / ms-stream?
    }
}
