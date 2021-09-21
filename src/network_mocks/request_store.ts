interface RequestTimestamps {
  opened?: number;
  send?: number;
  succeeded?: number;
  failed?: number;
  aborted?: number;
}

enum RequestState {
  OPENED = "opened",
  LOADED = "loaded",
  ERRORED = "errored",
  ABORTED = "aborted",
  PENDING = "pending",
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
  private _store: RequestStoreItem[];
  constructor() {
    this._store = [];
  }

  public getStored(): RequestStoreItem[] {
    return this._store;
  }

  public open(method: string, url: string) : RequestReference {
    const newItem: RequestStoreItem = {
      timestamps: { opened: performance.now() },
      method,
      url,
      state: RequestState.OPENED
    };
    this._store.push(newItem);
    return new RequestReference(newItem);
  }
}

export class RequestReference {
  private _wrapped: RequestStoreItem;

  constructor(item: RequestStoreItem) {
    this._wrapped = item;
  }

  public send() {
    if (this._wrapped.state !== RequestState.OPENED) {
      throw new Error("Request already sent");
    }
    this._wrapped.state = RequestState.PENDING;
    this._wrapped.timestamps.send = performance.now();
  }

  public loaded(
    httpStatus: number,
    contentType: string|null,
    size: number|undefined
  ) {
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
  }

  public failed(
    httpStatus: number,
    contentType: string|null,
    size: number|undefined
  ) {
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
  }

  public aborted() {
    if (this._wrapped.state !== RequestState.PENDING) {
      throw new Error("Request not pending");
    }
    this._wrapped.timestamps.aborted = performance.now();
    this._wrapped.state = RequestState.ABORTED;
  }
}
