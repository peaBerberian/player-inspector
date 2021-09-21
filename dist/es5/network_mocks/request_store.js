var RequestState;
(function (RequestState) {
    RequestState["OPENED"] = "opened";
    RequestState["LOADED"] = "loaded";
    RequestState["ERRORED"] = "errored";
    RequestState["ABORTED"] = "aborted";
    RequestState["PENDING"] = "pending";
})(RequestState || (RequestState = {}));
var RequestStore = /** @class */ (function () {
    function RequestStore() {
        this._store = [];
    }
    RequestStore.prototype.getStored = function () {
        return this._store;
    };
    RequestStore.prototype.open = function (method, url) {
        var newItem = {
            timestamps: { opened: performance.now() },
            method: method,
            url: url,
            state: RequestState.OPENED
        };
        this._store.push(newItem);
        return new RequestReference(newItem);
    };
    return RequestStore;
}());
export default RequestStore;
var RequestReference = /** @class */ (function () {
    function RequestReference(item) {
        this._wrapped = item;
    }
    RequestReference.prototype.send = function () {
        if (this._wrapped.state !== RequestState.OPENED) {
            throw new Error("Request already sent");
        }
        this._wrapped.state = RequestState.PENDING;
        this._wrapped.timestamps.send = performance.now();
    };
    RequestReference.prototype.loaded = function (httpStatus, contentType, size) {
        if (this._wrapped.state !== RequestState.PENDING) {
            throw new Error("Request not pending");
        }
        this._wrapped.timestamps.succeeded = performance.now();
        this._wrapped.httpStatus = httpStatus;
        this._wrapped.state = RequestState.LOADED;
        if (contentType !== null) {
            this._wrapped.contentType = contentType;
        }
        if (size !== undefined) {
            this._wrapped.size = size;
        }
    };
    RequestReference.prototype.failed = function (httpStatus, contentType, size) {
        if (this._wrapped.state !== RequestState.PENDING) {
            throw new Error("Request not pending");
        }
        this._wrapped.timestamps.failed = performance.now();
        this._wrapped.httpStatus = httpStatus;
        this._wrapped.state = RequestState.ERRORED;
        if (contentType !== null) {
            this._wrapped.contentType = contentType;
        }
        if (size !== undefined) {
            this._wrapped.size = size;
        }
    };
    RequestReference.prototype.aborted = function () {
        if (this._wrapped.state !== RequestState.PENDING) {
            throw new Error("Request not pending");
        }
        this._wrapped.timestamps.aborted = performance.now();
        this._wrapped.state = RequestState.ABORTED;
    };
    return RequestReference;
}());
export { RequestReference };
