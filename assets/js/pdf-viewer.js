// PDF loading, rendering, and page drawing

function getSelectionPosition() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
  };
}

function isPdfFile(file) {
  if (!file) return false;
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function processPdfFile(file) {
  if (!isPdfFile(file)) {
    showModal("Please select a PDF file.", () => {});
    return;
  }

  loader.classList.remove("hidden");
  const reader = new FileReader();
  reader.onload = async function (e) {
    const typedarray = new Uint8Array(e.target.result);
    const loadingTask = pdfjsLib.getDocument(typedarray);
    pdfDoc = await loadingTask.promise;

    pdfContainer.innerHTML = "";
    annotations = [];
    await renderPDF();
    loader.classList.add("hidden");

    // Enable zoom controls when PDF is loaded
    document.getElementById("zoom-in-btn")?.removeAttribute("disabled");
    document.getElementById("zoom-out-btn")?.removeAttribute("disabled");
    document.getElementById("reset-zoom-btn")?.removeAttribute("disabled");
    updateZoom(); // Update zoom display
  };
  reader.readAsArrayBuffer(file);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processPdfFile(file);
}

// Zoom functions (exposed globally for onclick handlers)
window.zoomIn = function () {
  pdfZoomScale = Math.min(pdfZoomScale + 0.25, 4.0); // Max 400%
  updateZoom();
};

window.zoomOut = function () {
  pdfZoomScale = Math.max(pdfZoomScale - 0.25, 0.5); // Min 50%
  updateZoom();
};

window.resetZoom = function () {
  pdfZoomScale = 1.5; // Reset to default
  updateZoom();
};

function updateZoom() {
  const zoomLevel = document.getElementById("zoom-level");
  if (zoomLevel) {
    zoomLevel.textContent = Math.round((pdfZoomScale / 1.5) * 100) + "%";
  }
  if (pdfDoc) {
    renderPDF();
  }
}

async function renderPDF() {
  if (!pdfDoc) return;
  pdfContainer.innerHTML = "";
  for (let num = 1; num <= pdfDoc.numPages; num++) {
    await renderPage(pdfDoc, num);
  }
  renderAnnotations();
}

async function renderPage(pdfDoc, num) {
  const page = await pdfDoc.getPage(num);

  const viewport = page.getViewport({ scale: pdfZoomScale });

  const pageWrapper = document.createElement("div");
  pageWrapper.className = "page relative mx-auto my-4";
  pageWrapper.style.width = `${viewport.width}px`;
  pageWrapper.style.height = `${viewport.height}px`;
  pageWrapper.dataset.pageNumber = String(num);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  const ratio = window.devicePixelRatio || 1;
  canvas.width = viewport.width * ratio;
  canvas.height = viewport.height * ratio;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  pageWrapper.appendChild(canvas);

  const highlightLayerDiv = document.createElement("div");
  highlightLayerDiv.className = "highlightLayer";
  pageWrapper.appendChild(highlightLayerDiv);

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer absolute top-0 left-0 w-full h-full";
  pageWrapper.appendChild(textLayerDiv);

  pdfContainer.appendChild(pageWrapper);

  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  await page.render({ canvasContext: context, viewport: viewport }).promise;

  const textContent = await page.getTextContent();
  pdfjsLib.renderTextLayer({
    textContent,
    container: textLayerDiv,
    viewport,
    textDivs: [],
  });
}

// Hook up initial events after DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  // Match the file input id used in index.html
  const fileInput = document.getElementById("pdf-file");
  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelect);
  }
  // Enable drag & drop if a drop zone is present
  if (typeof setupDragAndDrop === "function") {
    setupDragAndDrop();
  }

  // Keyboard shortcuts for zoom
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && pdfDoc) {
      // Ctrl (Windows/Linux) or Cmd (Mac)
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        window.zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        window.zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        window.resetZoom();
      }
    }
  });
});
