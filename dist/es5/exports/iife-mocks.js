/**
 * This file should be bundled into an IIFE and be directly used as an
 * userscript.
 * It mocks MSE-related APIs - which will fill the exported
 * `mediaSourceStore` and `XMLHttpRequest`s, which will fill the
 * exported `requestStore`.
 */
import startMockingMediaSource, { mediaSourceStore, } from "../mse_mocks/index";
import startMockingXHR, { requestStore, } from "../network_mocks/index";
startMockingMediaSource();
startMockingXHR();
var win = window;
win.mediaSourceStore = mediaSourceStore;
win.requestStore = requestStore;
