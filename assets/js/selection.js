// Text selection handling and annotation triggering

function handleTextSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    selectedText = '';
    currentSelectionMeta = null;
    floatingMenu.classList.add('hidden');
    return;
  }

  selectedText = sanitizeText(selection.toString());

  // Determine which page the selection belongs to and compute rects
  const range = selection.rangeCount ? selection.getRangeAt(0) : null;
  let pageWrapper = null;
  if (range) {
    const startNode = range.startContainer.nodeType === 3
      ? range.startContainer.parentElement
      : range.startContainer;
    pageWrapper = startNode instanceof Element ? startNode.closest('.page') : null;
  }

  currentSelectionMeta = null;
  if (range && pageWrapper) {
    const pageRect = pageWrapper.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).map(r => ({
      x: r.left - pageRect.left,
      y: r.top - pageRect.top,
      width: r.width,
      height: r.height,
    })).filter(r => r.width > 0 && r.height > 0);

    const pageNumber = Number(pageWrapper.dataset.pageNumber || '0');
    if (rects.length && pageNumber > 0) {
      currentSelectionMeta = { pageNumber, rects };
    }
  }

  const position = getSelectionPosition();
  if (!position) return;

  floatingMenu.style.left = `${position.x}px`;
  floatingMenu.style.top = `${position.y - 10}px`;
  floatingMenu.classList.remove('hidden');
}

// Create annotation immediately from current selection (no prompt)
function createAnnotationFromSelection() {
  if (!selectedText || !currentSelectionMeta) return;

  const annotation = {
    id: Date.now(),
    text: selectedText,
    comment: '', // start with empty comment; edit/add later in panel
    pageNumber: currentSelectionMeta.pageNumber,
    rects: currentSelectionMeta.rects,
    replies: [],
  };

  annotations.push(annotation);
  renderAnnotations();

  selectedText = '';
  currentSelectionMeta = null;
  floatingMenu.classList.add('hidden');
}

// Keep triggerAnnotation for the button; it just confirms creation
function triggerAnnotation() {
  createAnnotationFromSelection();
}

window.addEventListener('mouseup', handleTextSelection);
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') handleTextSelection();
});
