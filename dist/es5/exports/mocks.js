/**
 * This file which should be directly importable can be used to:
 *   - mock on demand MSE-related APIs (through
 *     `startMockingMediaSource`), which will fill the exported
 *     `mediaSourceStore`.
 *   - mock on demand `XMLHttpRequest`, which will fill the exported
 *     `requestStore`
 */
import startMockingMediaSource, { mediaSourceStore, } from "../mse_mocks/index";
import startMockingXHR, { requestStore, } from "../network_mocks/index";
export { startMockingMediaSource, startMockingXHR, mediaSourceStore, requestStore, };
