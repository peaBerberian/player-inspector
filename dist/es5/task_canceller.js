var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
import { noop } from "./utils";
/**
 * Class facilitating asynchronous task cancellation.
 *
 * This class can be used to notify some code running an asynchronous task (for
 * example, a request) that is should abort what it is doing (for example, abort
 * a request when it isn't needed anymore).
 *
 * To do that, the code which might ask for cancellation have to create a new
 * `TaskCanceller`:
 * ```js
 * const canceller = new TaskCanceller();
 * ```
 *
 * And has to provide its associated `CancellationSignal` to the code running
 * the asynchronous task:
 * ```js
 * runAsyncTask(canceller.signal);
 * ```
 *
 * In the asynchronous task, the signal can be listened to (see documentation
 * on `CancellationSignal` for more information):
 * ```js
 * function runAsyncTask(cancellationSignal) {
 *  // Let's say this function returns a Promise (this is not mandatory however)
 *  return Promise((resolve, reject) => {
 *    // In this example, we'll even catch the case where an asynchronous task
 *    // was already cancelled before being called.
 *    // This ensure that no code will run if that's the case.
 *    if (cancellationSignal.isCancelled) {
 *      // Here we're rejecting the CancellationError to notify the caller that
 *      // this error was due to the task being aborted.
 *      reject(cancellationSignal.cancellationError);
 *      return;
 *    }
 *
 *    // Example:
 *    // performing asynchronous task and registering callbacks on success/failure.
 *    const myCancellableTask = doSomeAsyncTasks()
 *      .onFinished(onTaskFinished);
 *      .onFailed(onTaskFailed);
 *
 *    // Run a callback when/if the corresponding `TaskCanceller` was triggered.
 *    // Run immediately if the TaskCanceller was already triggered.
 *    const deregisterSignal = cancellationSignal.register(onCancellation);
 *
 *    // Callback called on cancellation (if this task was cancelled while the
 *    // cancellationSignal's listener is still registered).
 *    // The `error` in argument is linked to that cancellation. It is usually
 *    // expected that the same Error instance is used when rejecting Promises.
 *    function onCancellation(error : CancellationError) {
 *      // abort asynchronous task
 *      myCancellableTask.cancel();
 *
 *      // In this example, reject the current pending Promise
 *      reject(CancellationError);
 *    }
 *
 *    // Callback called after the asynchronous task has finished with success.
 *    function onTaskFinished() {
 *      // Stop listening to the cancellationSignal
 *      deregisterSignal();
 *
 *      // Resolve the Promise
 *      resolve();
 *    }
 *
 *    // Callback called after the asynchronous task has finished with failure.
 *    function onTaskFailed(someError : Error) {
 *      // Stop listening to the cancellationSignal
 *      deregisterSignal();
 *
 *      // Resolve the Promise
 *      reject(error);
 *    }
 *  });
 * }
 * ```
 *
 * The code asking for cancellation can then trigger a cancellation at any time
 * (even before the signal was given) and listen to possible CancellationErrors
 * to know when it was cancelled.
 * ```js
 * const canceller = new TaskCanceller();
 *
 * runAsyncTask(canceller.signal)
 *   .then(() => { console.log("Task succeeded!"); )
 *   .catch((err) => {
 *      if (TaskCanceller.isCancellationError(err)) {
 *        console.log("Task cancelled!");
 *      } else {
 *        console.log("Task failed:", err);
 *      }
 *   });
 * canceller.cancel(); // Cancel the task, calling registered callbacks
 * ```
 * @class TaskCanceller
 */
var TaskCanceller = /** @class */ (function () {
    /**
     * Creates a new `TaskCanceller`, with its own `CancellationSignal` created
     * as its `signal` provide.
     * You can then pass this property to async task you wish to be cancellable.
     */
    function TaskCanceller() {
        var _a = createCancellationFunctions(), trigger = _a[0], register = _a[1];
        this.isUsed = false;
        this._trigger = trigger;
        this.signal = new CancellationSignal(register);
    }
    /**
     * "Trigger" the `TaskCanceller`, notify through its associated
     * `CancellationSignal` (its `signal` property) that a task should be aborted.
     *
     * Once called the `TaskCanceller` is permanently triggered.
     *
     * An optional CancellationError can be given in argument for when this
     * cancellation is actually triggered as a chain reaction from a previous
     * cancellation.
     * @param {Error} [originError]
     */
    TaskCanceller.prototype.cancel = function (originError) {
        if (this.isUsed) {
            return;
        }
        this.isUsed = true;
        var cancellationError = originError !== null && originError !== void 0 ? originError : new CancellationError();
        this._trigger(cancellationError);
    };
    /**
     * Check that the `error` in argument is a `CancellationError`, most likely
     * meaning that the linked error is due to a task aborted via a
     * `CancellationSignal`.
     * @param {*} error
     * @returns {boolean}
     */
    TaskCanceller.isCancellationError = function (error) {
        return error instanceof CancellationError;
    };
    return TaskCanceller;
}());
export default TaskCanceller;
/**
 * Class associated to a TaskCanceller allowing to be notified when a task
 * needs to be aborted.
 * @class
 */
var CancellationSignal = /** @class */ (function () {
    /**
     * Creates a new CancellationSignal.
     * /!\ Note: Only a `TaskCanceller` is supposed to be able to create one.
     * @param {Function} registerToSource - Function called when the task is
     * cancelled.
     */
    function CancellationSignal(registerToSource) {
        var _this = this;
        this.isCancelled = false;
        this.cancellationError = null;
        this._listeners = [];
        registerToSource(function (cancellationError) {
            _this.cancellationError = cancellationError;
            _this.isCancelled = true;
            while (_this._listeners.length > 0) {
                var listener = _this._listeners.splice(_this._listeners.length - 1, 1)[0];
                listener(cancellationError);
            }
        });
    }
    /**
     * Registers a function that will be called when/if the current task is
     * cancelled.
     *
     * Multiple calls to `register` can be performed to register multiple
     * callbacks on cancellation associated to the same `CancellationSignal`.
     *
     * @param {Function} fn - This function should perform all logic allowing to
     * abort everything the task is doing.
     *
     * It takes in argument the `CancellationError` which was created when the
     * task was aborted.
     * You can use this error to notify callers that the task has been aborted,
     * for example through a rejected Promise.
     *
     * @return {Function} - Removes that cancellation listener. You can call this
     * once you don't want the callback to be triggered anymore (e.g. after the
     * task succeeded or failed).
     * You don't need to call that function when cancellation has already been
     * performed.
     */
    CancellationSignal.prototype.register = function (fn) {
        var _this = this;
        if (this.isCancelled) {
            assert(this.cancellationError !== null);
            fn(this.cancellationError);
        }
        this._listeners.push(fn);
        return function () { return _this.deregister(fn); };
    };
    /**
     * De-register a function registered through the `register` function.
     * Do nothing if that function wasn't registered.
     *
     * You can call this method when using the return value of `register` is not
     * practical.
     * @param {Function} fn
     */
    CancellationSignal.prototype.deregister = function (fn) {
        if (this.isCancelled) {
            return;
        }
        for (var i = 0; i < this._listeners.length; i++) {
            if (this._listeners[i] === fn) {
                this._listeners.splice(i, 1);
                return;
            }
        }
    };
    return CancellationSignal;
}());
export { CancellationSignal };
/**
 * Error created when a task is cancelled through the TaskCanceller.
 *
 * @class CancellationError
 * @extends Error
 */
var CancellationError = /** @class */ (function (_super) {
    __extends(CancellationError, _super);
    /**
     * @param {string} message
     */
    function CancellationError() {
        var _this = _super.call(this) || this;
        // @see https://stackoverflow.com/questions/41102060/typescript-extending-error-class
        Object.setPrototypeOf(_this, CancellationError.prototype);
        _this.name = "CancellationError";
        _this.message = "This task was cancelled.";
        return _this;
    }
    return CancellationError;
}(Error));
export { CancellationError };
/**
 * Helper function allowing communication between a `TaskCanceller` and a
 * `CancellationSignal`.
 * @returns {Array.<Function>}
 */
function createCancellationFunctions() {
    var listener = noop;
    return [
        function trigger(error) {
            listener(error);
        },
        function register(newListener) {
            listener = newListener;
        },
    ];
}
/**
 * Throw an Error if the given assertion is false.
 * @param {boolean} assertion
 * @param {string} [message] - Optional message property for the AssertionError.
 * @throws Error - Throws if the assertion given is false
 */
function assert(assertion, message) {
    if (!assertion) {
        throw new Error(message === undefined ? "invalid assertion" :
            message);
    }
}
