import {mediaSourceStore, BufferedSegmentInfo} from "../mse_mocks/index";

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1;
const COLORS = [
  // "#fe4a49",
  "#2ab7ca",
  "#fed766",
  "#4dd248",
  "#a22c28",
  "#556b2f", // darkolivegreen
  "#add8e6", // lightblue
  "#90ee90", // lightgreen
  "#444444",
  "#40bfc1",
  "#57557e",
  "#fbe555",
  // "#f0134d",
];
const COLOR_CURRENT_POSITION = "#FF2323";


/**
 * Clear the whole canvas.
 * @param {Object} canvasContext
 */
function clearCanvas(canvasContext: CanvasRenderingContext2D): void {
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
function paintCurrentPosition(
  position: number|undefined,
  minimumPosition: number,
  maximumPosition: number,
  canvasCtx: CanvasRenderingContext2D
): void {
  if (typeof position === "number" &&
      position >= minimumPosition &&
      position < maximumPosition)
  {
    const lengthCanvas = maximumPosition - minimumPosition;
    canvasCtx.fillStyle = COLOR_CURRENT_POSITION;
    canvasCtx.fillRect(Math.ceil((position - minimumPosition) /
                                    lengthCanvas * CANVAS_WIDTH) - 1,
                       0,
                       2,
                       CANVAS_HEIGHT);
  }
}

interface ScaledSegment {
  scaledStart: number;
  scaledEnd: number;
  bufferedInfo: BufferedSegmentInfo;
}

/**
 * Scale given bufferedData in terms of percentage between the minimum and
 * maximum position. Filter out segment which are not part of it.
 * @param {Array.<Object>} bufferedData
 * @param {number} minimumPosition
 * @param {number} maximumPosition
 * @returns {Array.<Object>}
 */
function scaleSegments(
  bufferedData: BufferedSegmentInfo[],
  minimumPosition: number,
  maximumPosition: number
): ScaledSegment[] {
  const scaledSegments = [];
  const wholeDuration = maximumPosition - minimumPosition;
  for (let i = 0; i < bufferedData.length; i++) {
    const bufferedInfo = bufferedData[i];
    const start = bufferedInfo.bufferedStart === undefined ?
      bufferedInfo.start :
      bufferedInfo.bufferedStart;
    const end = bufferedInfo.bufferedEnd === undefined ?
      bufferedInfo.end :
      bufferedInfo.bufferedEnd;
    if (end > minimumPosition && start < maximumPosition) {
      const startPoint = Math.max(start - minimumPosition, 0);
      const endPoint = Math.min(end - minimumPosition, maximumPosition);
      const scaledStart = startPoint / wholeDuration;
      const scaledEnd = endPoint / wholeDuration;
      scaledSegments.push({ scaledStart,
                            scaledEnd,
                            bufferedInfo });
    }
  }
  return scaledSegments;
}

export default function displayCanvas() {
  const canvasEl = document.createElement("canvas");
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

  const representationsEncountered: string[] = [];
  let currentSegmentsScaled : ScaledSegment[]|undefined;

  /**
   * Paint a given segment in the canvas
   * @param {Object} scaledSegment - Buffered segment information with added
   * "scaling" information to know where it fits in the canvas.
   * @param {Object} canvasCtx - The canvas' 2D context
   */
  function paintSegment(
    scaledSegment: ScaledSegment,
    canvasCtx: CanvasRenderingContext2D
  ): void {
    const { representationId } = scaledSegment.bufferedInfo.representationInfo;
    let indexOfRepr = representationsEncountered
      .indexOf(representationId);
    if (indexOfRepr < 0) {
      representationsEncountered.push(representationId);
      indexOfRepr = representationsEncountered.length - 1;
    }
    const colorIndex = indexOfRepr % COLORS.length;
    const color = COLORS[colorIndex];
    const startX = scaledSegment.scaledStart * CANVAS_WIDTH;
    const endX = scaledSegment.scaledEnd * CANVAS_WIDTH;
    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(Math.ceil(startX),
                       0,
                       Math.ceil(endX - startX),
                       CANVAS_HEIGHT);
  }

  function getMousePositionInPercentage(event: MouseEvent): number|undefined {
    if (canvasEl === null || canvasEl === undefined) {
      return;
    }
    const rect = canvasEl.getBoundingClientRect();
    const point0 = rect.left;
    const clickPosPx = Math.max(event.clientX - point0, 0);
    const endPointPx = Math.max(rect.right - point0, 0);
    if (!endPointPx) {
      return 0;
    }
    return clickPosPx / endPointPx;
  };

  let minimumPosition: number|undefined;
  let maximumPosition: number|undefined;
  let currVideoElt: HTMLMediaElement|undefined;

  function getMousePosition(event: MouseEvent): number|undefined {
    if (minimumPosition === undefined || maximumPosition === undefined) {
      return undefined;
    }
    const mousePercent = getMousePositionInPercentage(event);
    const duration = Math.max(maximumPosition - minimumPosition, 0);
    return mousePercent === undefined ?
      undefined :
      mousePercent * duration + minimumPosition;
  }

  canvasEl.onclick = (evt: MouseEvent): void => {
    if (currVideoElt !== undefined) {
      const newPos = getMousePosition(evt);
      if (newPos !== undefined) {
        currVideoElt.currentTime = newPos;
      }
    }
  }

  document.body.appendChild(canvasEl);
  setInterval(() => {
    const ctx = canvasEl.getContext("2d");
    if (ctx === null) {
      return;
    }
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.height = CANVAS_HEIGHT;
    clearCanvas(ctx);

    const videoElts = document.getElementsByTagName("video");
    currVideoElt = undefined;
    for (let i = videoElts.length - 1; i >= 0; i--) {
      if (videoElts[i].buffered.length > 0) {
        currVideoElt = videoElts[i];
        break;
      }
    }
    if (currVideoElt === undefined) {
      return;
    }
    const mediaSourceArray = mediaSourceStore.getStored();
    if (mediaSourceArray.length === 0) {
      return;
    }
    const sourceBuffers = mediaSourceArray[mediaSourceArray.length - 1].sourceBuffers;
    const videoSb = sourceBuffers.find(s => s.mimeType.indexOf("video") >= 0);
    if (!videoSb) {
      return;
    }
    const data = videoSb.segmentInventory.getInventory();

    minimumPosition = Math.max(0, currVideoElt.currentTime - 60 * 60);
    maximumPosition = Math.min(
      currVideoElt.duration,
      currVideoElt.buffered.end(currVideoElt.buffered.length - 1) +
        60 * 60
    );

    currentSegmentsScaled =
      scaleSegments(data, minimumPosition, maximumPosition);

    if (minimumPosition === undefined ||
        maximumPosition === undefined ||
        minimumPosition >= maximumPosition)
    {
      return;
    }
    for (let i = 0; i < currentSegmentsScaled.length; i++) {
      paintSegment(currentSegmentsScaled[i], ctx);
    }
    paintCurrentPosition(currVideoElt.currentTime, minimumPosition, maximumPosition, ctx);
  }, 300);

  function onMouseMove(event: MouseEvent): void {
    if (currentSegmentsScaled === undefined) {
      removeToolTip();
      return;
    }
    const mousePercent = getMousePositionInPercentage(event);
    if (mousePercent === undefined) {
      removeToolTip();
      return;
    }

    for (let i = 0; i < currentSegmentsScaled.length; i++) {
      const scaledSegment = currentSegmentsScaled[i];
      if (mousePercent >= scaledSegment.scaledStart &&
          mousePercent < scaledSegment.scaledEnd)
      {
        const { start, end } = scaledSegment.bufferedInfo;
        const {
          representationId,
          height,
          width,
        } = scaledSegment.bufferedInfo.representationInfo;
        let newTipText = `segment: [${start.toFixed(1)}, ${end.toFixed(1)}]` + "\n" +
                         `representationId: ${representationId}`;
        if (height !== undefined) {
          newTipText += "\n" + `height: ${height}`;
        }
        if (width !== undefined) {
          newTipText += "\n" + `width: ${width}`;
        }
        displayToolTip(newTipText);
        return;
      }
    }
    removeToolTip(); // if none found
  };
}

function removeToolTip(): void {
  const currentElt = document.getElementById("PLAYER-INSPECTOR-tooltip-wrapper");
  if (currentElt !== null && currentElt.parentElement !== null) {
    currentElt.parentElement.removeChild(currentElt);
  }
}

function displayToolTip(text: string): void {
  const currentElt = document.getElementById("PLAYER-INSPECTOR-tooltip-wrapper");
  let div;
  let isNewDiv = false;
  if (currentElt !== null && currentElt.parentElement !== null) {
    const tip = currentElt.getElementsByClassName("PLAYER-INSPECTOR-tooltip")[0];
    if (tip !== undefined && tip.textContent === text) {
      return;
    } else {
      currentElt.innerHTML = "";
    }
    div = currentElt;
  } else {
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

  const pre = document.createElement("pre");
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
