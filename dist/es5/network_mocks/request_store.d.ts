interface RequestTimestamps {
    opened?: number;
    send?: number;
    succeeded?: number;
    failed?: number;
    aborted?: number;
}
declare enum RequestState {
    OPENED = "opened",
    LOADED = "loaded",
    ERRORED = "errored",
    ABORTED = "aborted",
    PENDING = "pending"
}
interface RequestStoreItem {
    timestamps: RequestTimestamps;
    method: string;
    url: string;
    state: RequestState;
    httpStatus?: number;
    contentType?: string;
    size?: number;
}
export default class RequestStore {
    private _store;
    constructor();
    getStored(): RequestStoreItem[];
    open(method: string, url: string): RequestReference;
}
export declare class RequestReference {
    private _wrapped;
    constructor(item: RequestStoreItem);
    send(): void;
    loaded(httpStatus: number, contentType: string | null, size: number | undefined): void;
    failed(httpStatus: number, contentType: string | null, size: number | undefined): void;
    aborted(): void;
}
export {};
