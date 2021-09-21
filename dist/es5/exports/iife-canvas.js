/**
 * This file should be bundled into an IIFE and be directly used as an
 * userscript.
 * It mocks MSE-related APIs - which will fill the exported
 * `mediaSourceStore` and `XMLHttpRequest`s, which will fill the
 * exported `requestStore`, as well as displaying a canvas providing a
 * visual representation of the page's video buffer when there is one.
 */
import renderUi from "../ui/index";
import startMockingMediaSource, { mediaSourceStore, } from "../mse_mocks/index";
import startMockingXHR, { requestStore, } from "../network_mocks/index";
startMockingMediaSource();
startMockingXHR();
var win = window;
win.mediaSourceStore = mediaSourceStore;
win.requestStore = requestStore;
document.addEventListener('DOMContentLoaded', function () {
    renderUi();
});
