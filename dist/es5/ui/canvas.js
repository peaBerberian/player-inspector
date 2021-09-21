import { mediaSourceStore } from "../mse_mocks/index";
var CANVAS_WIDTH = 1000;
var CANVAS_HEIGHT = 1;
var COLORS = [
    // "#fe4a49",
    "#2ab7ca",
    "#fed766",
    "#4dd248",
    "#a22c28",
    "#556b2f",
    "#add8e6",
    "#90ee90",
    "#444444",
    "#40bfc1",
    "#57557e",
    "#fbe555",
    // "#f0134d",
];
var COLOR_CURRENT_POSITION = "#FF2323";
/**
 * Clear the whole canvas.
 * @param {Object} canvasContext
 */
function clearCanvas(canvasContext) {
    canvasContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
/**
 * Represent the current position in the canvas.
 * @param {number|undefined} position - The current position
 * @param {number} minimumPosition - minimum possible position represented in
 * the canvas.
 * @param {number} maximumPosition - maximum possible position represented in
 * the canvas.
 * @param {Object} canvasCtx - The canvas' 2D context
 */
function paintCurrentPosition(position, minimumPosition, maximumPosition, canvasCtx) {
    if (typeof position === "number" &&
        position >= minimumPosition &&
        position < maximumPosition) {
        var lengthCanvas = maximumPosition - minimumPosition;
        canvasCtx.fillStyle = COLOR_CURRENT_POSITION;
        canvasCtx.fillRect(Math.ceil((position - minimumPosition) /
            lengthCanvas * CANVAS_WIDTH) - 1, 0, 2, CANVAS_HEIGHT);
    }
}
/**
 * Scale given bufferedData in terms of percentage between the minimum and
 * maximum position. Filter out segment which are not part of it.
 * @param {Array.<Object>} bufferedData
 * @param {number} minimumPosition
 * @param {number} maximumPosition
 * @returns {Array.<Object>}
 */
function scaleSegments(bufferedData, minimumPosition, maximumPosition) {
    var scaledSegments = [];
    var wholeDuration = maximumPosition - minimumPosition;
    for (var i = 0; i < bufferedData.length; i++) {
        var bufferedInfo = bufferedData[i];
        var start = bufferedInfo.bufferedStart === undefined ?
            bufferedInfo.start :
            bufferedInfo.bufferedStart;
        var end = bufferedInfo.bufferedEnd === undefined ?
            bufferedInfo.end :
            bufferedInfo.bufferedEnd;
        if (end > minimumPosition && start < maximumPosition) {
            var startPoint = Math.max(start - minimumPosition, 0);
            var endPoint = Math.min(end - minimumPosition, maximumPosition);
            var scaledStart = startPoint / wholeDuration;
            var scaledEnd = endPoint / wholeDuration;
            scaledSegments.push({ scaledStart: scaledStart, scaledEnd: scaledEnd, bufferedInfo: bufferedInfo });
        }
    }
    return scaledSegments;
}
export default function displayCanvas() {
    var canvasEl = document.createElement("canvas");
    canvasEl.style.height = "30px";
    canvasEl.style.opacity = "0.7";
    canvasEl.style.width = "calc(100% - 20px)";
    canvasEl.style.zIndex = "2147483647";
    canvasEl.style.backgroundColor = "#fff";
    canvasEl.style.border = "1px dotted black";
    canvasEl.style.position = "fixed";
    canvasEl.style.top = "10%";
    canvasEl.style.margin = "10px";
    canvasEl.height = CANVAS_HEIGHT;
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.className = "PLAYER-INSPECTOR-CANVAS";
    canvasEl.onmouseleave = removeToolTip;
    canvasEl.onmousemove = onMouseMove;
    var representationsEncountered = [];
    var currentSegmentsScaled;
    /**
     * Paint a given segment in the canvas
     * @param {Object} scaledSegment - Buffered segment information with added
     * "scaling" information to know where it fits in the canvas.
     * @param {Object} canvasCtx - The canvas' 2D context
     */
    function paintSegment(scaledSegment, canvasCtx) {
        var representationId = scaledSegment.bufferedInfo.representationInfo.representationId;
        var indexOfRepr = representationsEncountered
            .indexOf(representationId);
        if (indexOfRepr < 0) {
            representationsEncountered.push(representationId);
            indexOfRepr = representationsEncountered.length - 1;
        }
        var colorIndex = indexOfRepr % COLORS.length;
        var color = COLORS[colorIndex];
        var startX = scaledSegment.scaledStart * CANVAS_WIDTH;
        var endX = scaledSegment.scaledEnd * CANVAS_WIDTH;
        canvasCtx.fillStyle = color;
        canvasCtx.fillRect(Math.ceil(startX), 0, Math.ceil(endX - startX), CANVAS_HEIGHT);
    }
    function getMousePositionInPercentage(event) {
        if (canvasEl === null || canvasEl === undefined) {
            return;
        }
        var rect = canvasEl.getBoundingClientRect();
        var point0 = rect.left;
        var clickPosPx = Math.max(event.clientX - point0, 0);
        var endPointPx = Math.max(rect.right - point0, 0);
        if (!endPointPx) {
            return 0;
        }
        return clickPosPx / endPointPx;
    }
    ;
    var minimumPosition;
    var maximumPosition;
    var currVideoElt;
    function getMousePosition(event) {
        if (minimumPosition === undefined || maximumPosition === undefined) {
            return undefined;
        }
        var mousePercent = getMousePositionInPercentage(event);
        var duration = Math.max(maximumPosition - minimumPosition, 0);
        return mousePercent === undefined ?
            undefined :
            mousePercent * duration + minimumPosition;
    }
    canvasEl.onclick = function (evt) {
        if (currVideoElt !== undefined) {
            var newPos = getMousePosition(evt);
            if (newPos !== undefined) {
                currVideoElt.currentTime = newPos;
            }
        }
    };
    document.body.appendChild(canvasEl);
    setInterval(function () {
        var ctx = canvasEl.getContext("2d");
        if (ctx === null) {
            return;
        }
        canvasEl.width = CANVAS_WIDTH;
        canvasEl.height = CANVAS_HEIGHT;
        clearCanvas(ctx);
        var videoElts = document.getElementsByTagName("video");
        currVideoElt = undefined;
        for (var i = videoElts.length - 1; i >= 0; i--) {
            if (videoElts[i].buffered.length > 0) {
                currVideoElt = videoElts[i];
                break;
            }
        }
        if (currVideoElt === undefined) {
            return;
        }
        var mediaSourceArray = mediaSourceStore.getStored();
        if (mediaSourceArray.length === 0) {
            return;
        }
        var sourceBuffers = mediaSourceArray[mediaSourceArray.length - 1].sourceBuffers;
        var videoSb = sourceBuffers.find(function (s) { return s.mimeType.indexOf("video") >= 0; });
        if (!videoSb) {
            return;
        }
        var data = videoSb.segmentInventory.getInventory();
        minimumPosition = Math.max(0, currVideoElt.currentTime - 60 * 60);
        maximumPosition = Math.min(currVideoElt.duration, currVideoElt.buffered.end(currVideoElt.buffered.length - 1) +
            60 * 60);
        currentSegmentsScaled =
            scaleSegments(data, minimumPosition, maximumPosition);
        if (minimumPosition === undefined ||
            maximumPosition === undefined ||
            minimumPosition >= maximumPosition) {
            return;
        }
        for (var i = 0; i < currentSegmentsScaled.length; i++) {
            paintSegment(currentSegmentsScaled[i], ctx);
        }
        paintCurrentPosition(currVideoElt.currentTime, minimumPosition, maximumPosition, ctx);
    }, 300);
    function onMouseMove(event) {
        if (currentSegmentsScaled === undefined) {
            removeToolTip();
            return;
        }
        var mousePercent = getMousePositionInPercentage(event);
        if (mousePercent === undefined) {
            removeToolTip();
            return;
        }
        for (var i = 0; i < currentSegmentsScaled.length; i++) {
            var scaledSegment = currentSegmentsScaled[i];
            if (mousePercent >= scaledSegment.scaledStart &&
                mousePercent < scaledSegment.scaledEnd) {
                var _a = scaledSegment.bufferedInfo, start = _a.start, end = _a.end;
                var _b = scaledSegment.bufferedInfo.representationInfo, representationId = _b.representationId, height = _b.height, width = _b.width;
                var newTipText = "segment: [" + start.toFixed(1) + ", " + end.toFixed(1) + "]" + "\n" +
                    ("representationId: " + representationId);
                if (height !== undefined) {
                    newTipText += "\n" + ("height: " + height);
                }
                if (width !== undefined) {
                    newTipText += "\n" + ("width: " + width);
                }
                displayToolTip(newTipText);
                return;
            }
        }
        removeToolTip(); // if none found
    }
    ;
}
function removeToolTip() {
    var currentElt = document.getElementById("PLAYER-INSPECTOR-tooltip-wrapper");
    if (currentElt !== null && currentElt.parentElement !== null) {
        currentElt.parentElement.removeChild(currentElt);
    }
}
function displayToolTip(text) {
    var currentElt = document.getElementById("PLAYER-INSPECTOR-tooltip-wrapper");
    var div;
    var isNewDiv = false;
    if (currentElt !== null && currentElt.parentElement !== null) {
        var tip = currentElt.getElementsByClassName("PLAYER-INSPECTOR-tooltip")[0];
        if (tip !== undefined && tip.textContent === text) {
            return;
        }
        else {
            currentElt.innerHTML = "";
        }
        div = currentElt;
    }
    else {
        isNewDiv = true;
        div = document.createElement("div");
        div.id = "PLAYER-INSPECTOR-tooltip-wrapper";
        div.style.position = "absolute";
        div.style.display = "block";
        div.style.left = "0px";
        div.style.padding = "5px";
        div.style.fontSize = "12px";
        div.style.zIndex = "999999999999";
        div.style.transform = "scaleY(1)";
        div.style.animation = "fadein 0.6s";
        div.style.backgroundColor = "#1d1d1d";
        div.style.color = "white";
        div.style.top = "10px";
    }
    var pre = document.createElement("pre");
    pre.className = "PLAYER-INSPECTOR-tooltip";
    pre.textContent = text;
    pre.style.display = "inline";
    pre.style.fontFamily = "monospace, mono, sans-serif";
    pre.style.pointerEvents = "none";
    div.appendChild(pre);
    if (isNewDiv) {
        document.body.appendChild(div);
    }
}
