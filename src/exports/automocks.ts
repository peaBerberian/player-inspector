/**
 * This file which should be directly importable and will directly mock both
 * MSE-related APIs - which will fill the exported `mediaSourceStore` and
 * `XMLHttpRequest`s, which will fill the exported `requestStore`
 */

import startMockingMediaSource, {
  mediaSourceStore,
} from "../mse_mocks/index";
import startMockingXHR, {
  requestStore,
} from "../network_mocks/index";

startMockingMediaSource();
startMockingXHR();

export {
  mediaSourceStore,
  requestStore,
};
