// Set up PDF.js worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null;
let selectedText = "";
let annotations = []; // Array to store all annotations and their replies
let currentSelectionMeta = null; // { pageNumber, rects: [{x,y,width,height}] }

const pdfContainer = document.getElementById('pdf-container');
const commentsList = document.getElementById('comments-list');
const floatingMenu = document.getElementById('floating-menu');
const loader = document.getElementById('loader');
const appContainer = document.getElementById('app-container');
const exportAllBtn = document.getElementById('export-all-btn');
const sectionTabs = document.querySelectorAll('[data-section-target]');
const pdfSection = document.getElementById('pdf-section');
const textSection = document.getElementById('text-section');
const pasteSection = document.getElementById('paste-section');
const exportSection = document.getElementById('export-section');
const exportLayoutGrid = document.getElementById('export-layout-grid');
const exportLoader = document.getElementById('export-loader');
const chooseDirBtn = document.getElementById('choose-dir-btn');
const saveDirLabel = document.getElementById('save-dir-label');
const pasteStatus = document.getElementById('paste-status');
const pasteDropzone = document.getElementById('paste-dropzone');
const pastedImageWrapper = document.getElementById('pasted-image-wrapper');
const pastedImage = document.getElementById('pasted-image');
const pastedMeta = document.getElementById('pasted-meta');

let currentSection = 'pdf';
let saveDirectoryHandle = null;
const sectionMap = {
    pdf: pdfSection,
    text: textSection,
    paste: pasteSection,
    export: exportSection,
};

function switchSection(target) {
    currentSection = target;
    Object.entries(sectionMap).forEach(([name, section]) => {
        if (!section) return;
        section.classList.toggle('hidden', name !== target);
    });
    sectionTabs.forEach(btn => {
        const isActive = btn.dataset.sectionTarget === target;
        btn.classList.toggle('active', isActive);
    });
}

sectionTabs.forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.sectionTarget));
});
switchSection('pdf');

// --- Confirmation Modal Functions (Replaces alert/confirm) ---
let modalCallback = null;

function showModal(message, callback) {
    document.getElementById('modal-message').textContent = message;
    modalCallback = callback;
    document.getElementById('modal-confirm-btn').onclick = () => {
        if (modalCallback) {
            modalCallback();
        }
        hideModal();
    };
    document.getElementById('confirmation-modal').classList.remove('hidden');
}

function hideModal() {
    document.getElementById('confirmation-modal').classList.add('hidden');
    modalCallback = null;
}

// --- Utility Functions ---

/**
 * Safely escapes text for use in HTML attributes (like onclick strings).
 * @param {string} text 
 * @returns {string} Escaped text.
 */
function escapeForOnclick(text) {
    return text.replace(/\\/g, '\\\\')
               .replace(/'/g, '\\\'')
               .replace(/"/g, '\\\"');
}

/**
 * Escapes text for safe HTML rendering (e.g., inside innerHTML).
 * @param {string} text 
 * @returns {string}
 */
function escapeForHtml(text) {
    const value = text == null ? '' : String(text);
    return value.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
}

/**
 * Copies text to the clipboard using the synchronous execCommand method
 * for maximum compatibility within an iFrame environment.
 * @param {string} text 
 */
function copyToClipboard(text) {
    const tempInput = document.createElement('textarea');
    tempInput.style.position = 'fixed';
    tempInput.style.opacity = '0';
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    
    try {
        const successful = document.execCommand('copy');
        const msg = successful ? 'successful' : 'unsuccessful';
        console.log('Copying text command was ' + msg);
    } catch (err) {
        console.error('Oops, unable to copy', err);
    }
    
    document.body.removeChild(tempInput);
}

/**
 * Sanitizes selected text to remove PDF copy artifacts, control chars,
 * ligatures, and odd whitespace while preserving readability.
 * @param {string} s
 * @returns {string}
 */
function sanitizeText(s) {
    if (!s) return '';
    let t = String(s);
    // Remove hyphen at end-of-line followed by newline (join split words)
    t = t.replace(/-\s*[\r\n]+/g, '');
    // Normalize Unicode (convert ligatures like fi)
    try { t = t.normalize('NFKC'); } catch (e) { /* ignore */ }
    // Replace non-breaking and thin spaces/etc with regular space
    t = t.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
    // Replace line breaks with spaces
    t = t.replace(/[\r\n]+/g, ' ');
    // Replace C0/C1 control characters with a space
    t = t.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
    // Optional: normalize curly quotes/dashes to standard characters
    t = t.replace(/[""]/g, '"').replace(/[`']/g, "'");
    // Collapse multiple spaces
    t = t.replace(/\s{2,}/g, ' ').trim();
    return t;
}

/**
 * Calculates the viewport position of the current text selection.
 */
function getSelectionPosition() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    return {
        left: rect.left + rect.width / 2, 
        top: rect.top - 10,
    };
}

// --- Core PDF Loading Functions ---
function isPdfFile(file) {
    if (!file) return false;
    const byType = typeof file.type === 'string' && file.type.toLowerCase().includes('pdf');
    const byName = typeof file.name === 'string' && /\.pdf$/i.test(file.name);
    return byType || byName;
}

function processPdfFile(file) {
    if (!isPdfFile(file)) {
        console.warn('Dropped file is not a PDF.');
        return;
    }
    appContainer.style.display = 'grid';
    pdfContainer.innerHTML = '';
    loader.classList.remove('hidden');

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const pdfData = new Uint8Array(this.result);
        renderPDF(pdfData);
    };
    fileReader.readAsArrayBuffer(file);
}

function handleFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    processPdfFile(file);
}

async function handleExportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    await buildExportLayout(file);
}

async function downloadExportPdf() {
    if (!exportLayoutGrid) return;
    const spreads = Array.from(exportLayoutGrid.querySelectorAll('.export-spread'));
    if (!spreads.length) return;

    const jspdfLib = window.jspdf || window.jsPDF || {};
    const jsPDF = jspdfLib.jsPDF || jspdfLib.jsPDF;
    if (!jsPDF) return;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    for (let i = 0; i < spreads.length; i++) {
        const spread = spreads[i];
        const canvas = await html2canvas(spread, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
        });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) {
            pdf.addPage();
        }
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
    }

    pdf.save('export-layout.pdf');
}

async function buildExportLayout(file) {
    if (!exportLayoutGrid) return;
    if (!isPdfFile(file)) {
        exportLayoutGrid.innerHTML = `<p class="text-sm text-red-600">Please upload a valid PDF file.</p>`;
        return;
    }
    exportLayoutGrid.innerHTML = '';
    exportLoader?.classList.remove('hidden');
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfData = new Uint8Array(arrayBuffer);
        const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        for (let spreadStart = 1; spreadStart <= doc.numPages; spreadStart += 3) {
            const spread = document.createElement('section');
            spread.className = 'export-spread bg-white border border-indigo-100 rounded-3xl shadow-xl space-y-6';
            const spreadTitle = document.createElement('div');
            spreadTitle.className = 'flex items-center justify-between text-xs uppercase tracking-wide text-gray-500';
            const lastPage = Math.min(spreadStart + 2, doc.numPages);
            const titleLabel = spreadStart === lastPage ? `Page ${spreadStart}` : `Pages ${spreadStart} - ${lastPage}`;
            spreadTitle.innerHTML = `<span class="font-semibold text-indigo-600">${titleLabel}</span><span>Export spread</span>`;
            spread.appendChild(spreadTitle);

            const rows = [spreadStart, spreadStart + 1, spreadStart + 2].filter(pageNum => pageNum <= doc.numPages);
            for (const pageNum of rows) {
                const row = await createExportRow(doc, pageNum);
                spread.appendChild(row);
            }

            exportLayoutGrid.appendChild(spread);
        }
    } catch (error) {
        console.error('Export layout error', error);
        const message = error?.message ? escapeForHtml(error.message) : 'Try another PDF.';
        exportLayoutGrid.innerHTML = `<p class="text-sm text-red-600">Unable to build layout: ${message}</p>`;
    } finally {
        exportLoader?.classList.add('hidden');
    }
}

async function createExportRow(pdfDocument, pageNumber) {
    const row = document.createElement('div');
    row.className = 'export-row grid gap-4 lg:gap-6 items-stretch grid-cols-1 lg:grid-cols-[70%_30%]';
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });

    const previewCol = document.createElement('div');
    previewCol.className = 'space-y-2';
    previewCol.innerHTML = `<p class="text-xs uppercase tracking-wide text-gray-500 font-semibold">Page ${pageNumber}</p>`;

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'rounded-2xl border border-gray-200 overflow-hidden shadow-inner bg-gray-50';
    previewWrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    previewWrapper.style.minHeight = '280px';
    previewWrapper.style.display = 'block';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.dataset.exportCanvas = `page-${pageNumber}`;
    previewWrapper.appendChild(canvas);
    previewCol.appendChild(previewWrapper);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const commentCol = document.createElement('div');
    commentCol.className = 'comment-card';
    commentCol.innerHTML = `<p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Comments</p>`;

    row.appendChild(previewCol);
    row.appendChild(commentCol);
    return row;
}

// Replaced: renderPDF was corrupted by nested functions. Provide clean implementation.
async function renderPDF(pdfData) {
    try {
        pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const numPages = pdfDoc.numPages;
        for (let i = 1; i <= numPages; i++) {
            await renderPage(pdfDoc, i);
        }
        loader.classList.add('hidden');
        document.removeEventListener('mouseup', handleTextSelection);
        document.addEventListener('mouseup', handleTextSelection);
        document.removeEventListener('mousedown', checkHideFloatingMenu);
        document.addEventListener('mousedown', checkHideFloatingMenu);
    } catch (error) {
        console.error('Error rendering PDF:', error);
        loader.classList.add('hidden');
        pdfContainer.innerHTML = '<p class="text-center text-red-500 p-10">Error loading PDF. Check console for details.</p>';
    }
}

// --- Drag & Drop Setup ---
function setupDragAndDrop() {
    // Prevent default on window to avoid the browser navigating away
    ;['dragover','drop'].forEach(evt => {
        window.addEventListener(evt, e => {
            e.preventDefault();
        });
    });

    const dz = pdfContainer;
    if (!dz) return;

    dz.addEventListener('dragenter', e => {
        e.preventDefault();
        dz.classList.add('drop-active');
    });
    dz.addEventListener('dragover', e => {
        e.preventDefault();
        dz.classList.add('drop-active');
    });
    dz.addEventListener('dragleave', e => {
        // Only remove when leaving the container
        if (e.target === dz) dz.classList.remove('drop-active');
    });
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drop-active');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
            processPdfFile(files[0]);
        }
    });

    // Also accept drop anywhere on the page as a fallback
    document.body.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drop-active');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
            processPdfFile(files[0]);
        }
    });
    window.addEventListener('dragenter', () => dz.classList.add('drop-active'));
    window.addEventListener('dragleave', () => dz.classList.remove('drop-active'));
}

// Initialize drag & drop once script loads
setupDragAndDrop();

async function renderPage(pdfDoc, num) {
    const page = await pdfDoc.getPage(num);
    const scale = 1.5;
    const viewport = page.getViewport({ scale: scale });

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page relative mx-auto my-4';
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;
    pageWrapper.dataset.pageNumber = String(num);
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    pageWrapper.appendChild(canvas);

    // Highlight layer sits above canvas, below textLayer
    const highlightLayerDiv = document.createElement('div');
    highlightLayerDiv.className = 'highlightLayer';
    pageWrapper.appendChild(highlightLayerDiv);

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer absolute top-0 left-0 w-full h-full';
    pageWrapper.appendChild(textLayerDiv);

    pdfContainer.appendChild(pageWrapper);

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    const textContent = await page.getTextContent();
    
    pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: [],
    });
}

// --- Annotation and Interaction Functions ---

/**
 * Renders the annotations array to the DOM.
 */
function renderAnnotations() {
    commentsList.innerHTML = '';
    
    if (annotations.length === 0) {
        commentsList.innerHTML = '<p id="no-comments" class="text-gray-400 italic text-sm">No annotations added yet. Select text in the PDF to start annotating.</p>';
        exportAllBtn.disabled = true;
        // still clear highlights
        renderHighlights();
        return;
    }

    exportAllBtn.disabled = false;
    
    // Render in reverse order (newest first)
    annotations.slice().reverse().forEach(ann => {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment-highlight group'; 
        commentDiv.setAttribute('data-id', ann.id);

        const safeTextForDisplay = escapeForHtml(ann.text);
        const safeTextForClipboard = escapeForOnclick(ann.text);
        
        // Build HTML for replies
        const replyListHtml = ann.replies.length > 0 ? 
            `<p class="text-xs font-semibold mt-3 text-gray-700">Comments/Questions:</p>
            <ul class="list-disc ml-4 mt-1 space-y-1 reply-list">
                ${ann.replies.map((reply, index) => `
                    <li class="flex items-center justify-between group/reply text-gray-700 p-1 hover:bg-amber-100 rounded transition duration-100">
                        <span id="reply-text-${ann.id}-${index}" 
                              ondblclick="startEditReply(event, ${ann.id}, ${index})"
                              class="flex-grow cursor-pointer">${reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                        <button onclick="deleteReply(${ann.id}, ${index})" 
                                class="ml-2 p-1 text-red-400 hover:text-red-600 opacity-0 group-hover/reply:opacity-100 transition-opacity" 
                                title="Delete Reply">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </li>
                `).join('')}
            </ul>` : '';

        // HTML structure for a single annotation
        commentDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <p class="text-xs text-gray-500 font-mono">Annotated Text:</p>
                <div class="flex space-x-2">
                    <button onclick="copyToClipboard('${safeTextForClipboard}')" 
                            class="copy-btn text-xs text-indigo-500 hover:text-indigo-700 font-medium py-1 px-2 rounded transition duration-150">
                        Copy to Clipboard
                    </button>
                    <button onclick="deleteAnnotation(${ann.id})" 
                            class="copy-btn text-xs text-red-500 hover:text-red-700 font-medium py-1 px-2 rounded transition duration-150">
                        Delete Annotation
                    </button>
                </div>
            </div>
            <blockquote class="comment-text">${safeTextForDisplay}</blockquote>
            
            ${replyListHtml}

            <div class="mt-4 pt-3 border-t border-amber-400">
                <p class="text-xs font-semibold text-gray-600 mb-1">Add Reply/Note:</p>
                <div class="flex space-x-2">
                    <input type="text" id="reply-input-${ann.id}" placeholder="Type your comment/question here..." 
                        class="flex-grow text-sm border border-gray-300 p-2 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                        onkeydown="handleReplyInputKey(event, ${ann.id})">
                    <button onclick="addReply(${ann.id})" class="bg-indigo-500 hover:bg-indigo-600 text-white text-sm py-2 px-3 rounded-lg font-semibold transition duration-150" title="Add Reply">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
                            <path fill-rule="evenodd" d="M3 5a2 2 0 012-2v.005L5 3h14l.005.005A2 2 0 0119 5v10a2 2 0 01-2 2H7a2 2 0 01-2-2v-3.001A2 2 0 013 12V5zm1.707.707l1.414 1.414L10 10.414l-4.828 4.828-1.414-1.414L7.586 10 3.707 6.121z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
        `;

        commentsList.appendChild(commentDiv);
    });

    // After rendering side list, render highlights over PDF pages
    renderHighlights();
}

/**
 * Deletes an entire annotation block.
 * @param {number} annotationId 
 */
function deleteAnnotation(annotationId) {
    showModal('Are you sure you want to delete this entire annotation block and all its replies?', () => {
        annotations = annotations.filter(ann => ann.id !== annotationId);
        renderAnnotations();
    });
}

/**
 * Deletes a specific reply from an annotation.
 * @param {number} annotationId 
 * @param {number} replyIndex 
 */
function deleteReply(annotationId, replyIndex) {
    const annotation = annotations.find(ann => ann.id === annotationId);
    if (annotation) {
        // Since this is a minor deletion and not the main block, we skip the modal for brevity
        annotation.replies.splice(replyIndex, 1);
        renderAnnotations();
    }
}

/**
 * Initiates editing for a specific reply text (triggered by double-click).
 * @param {Event} event 
 * @param {number} annotationId 
 * @param {number} replyIndex 
 */
function startEditReply(event, annotationId, replyIndex) {
    const replySpan = document.getElementById(`reply-text-${annotationId}-${replyIndex}`);
    if (!replySpan || replySpan.querySelector('input')) return;

    const originalText = replySpan.textContent;
    
    // Remove the delete button temporarily during edit for cleaner UI
    const parentLi = replySpan.closest('li');
    const deleteButton = parentLi.querySelector('button[title="Delete Reply"]');
    if (deleteButton) deleteButton.style.display = 'none';

    replySpan.innerHTML = `
        <input type="text" value="${originalText.replace(/"/g, '&quot;')}" 
               id="edit-input-${annotationId}-${replyIndex}" 
               onblur="saveEditReply(event, ${annotationId}, ${replyIndex})"
               onkeydown="handleEditKeydown(event, ${annotationId}, ${replyIndex})"
               class="w-full text-sm border border-indigo-500 p-1 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
    `;
    
    const input = document.getElementById(`edit-input-${annotationId}-${replyIndex}`);
    input.focus();
}

/**
 * Handles Enter (save) and Esc (cancel) key presses during editing.
 * @param {Event} event 
 * @param {number} annotationId 
 * @param {number} replyIndex 
 */
function handleEditKeydown(event, annotationId, replyIndex) {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveEditReply(event, annotationId, replyIndex);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        // Revert state (re-render)
        renderAnnotations();
    }
}

/**
 * Saves the edited reply text when Enter is pressed or input loses focus.
 * @param {Event} event 
 * @param {number} annotationId 
 * @param {number} replyIndex 
 */
function saveEditReply(event, annotationId, replyIndex) {
    const input = event.target;
    const newText = input.value.trim();

    const annotation = annotations.find(ann => ann.id === annotationId);
    if (annotation) {
        if (newText) {
            annotation.replies[replyIndex] = newText;
        } else {
            // If text is empty, treat as deletion
            annotation.replies.splice(replyIndex, 1);
        }
        renderAnnotations();
    }
}


function addReply(annotationId) {
    const replyInput = document.getElementById(`reply-input-${annotationId}`);
    const replyText = replyInput.value.trim();

    if (replyText) {
        const annotation = annotations.find(ann => ann.id === annotationId);
        if (annotation) {
            annotation.replies.push(replyText);
            replyInput.value = '';
            renderAnnotations();
        }
    }
}

// Allow pressing Enter inside reply input to submit
function handleReplyInputKey(event, annotationId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addReply(annotationId);
    }
}

function checkHideFloatingMenu(event) {
    const isClickInsideMenu = floatingMenu.contains(event.target);
    if (!isClickInsideMenu) {
        floatingMenu.classList.add('hidden');
        window.getSelection().removeAllRanges();
        currentSelectionMeta = null;
    }
}

/**
 * Handles text selection, cleans up PDF line breaks/hyphens, 
 * calculates position, and displays the floating menu.
 */
function handleTextSelection() {
    setTimeout(() => {
        const selection = window.getSelection();
        let rawText = selection.toString();
        selectedText = sanitizeText(rawText);
        
        if (selectedText.length > 0) {
            // Determine which page the selection belongs to
            const range = selection.rangeCount ? selection.getRangeAt(0) : null;
            let pageWrapper = null;
            if (range) {
                const startNode = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
                pageWrapper = startNode instanceof Element ? startNode.closest('.page') : null;
            }

            // Compute rects relative to the page wrapper
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
            if (position) {
                floatingMenu.style.left = `${position.left}px`;
                floatingMenu.style.top = `${position.top}px`;
                floatingMenu.classList.remove('hidden');
            }
        } else {
            if (!floatingMenu.contains(document.activeElement)) {
                floatingMenu.classList.add('hidden');
            }
            currentSelectionMeta = null;
        }
    }, 100);
}

function triggerAnnotation() {
    if (selectedText) {
        const newAnnotation = {
            id: Date.now(),
            text: selectedText,
            replies: [],
            pageNumber: currentSelectionMeta?.pageNumber || null,
            rects: currentSelectionMeta?.rects || [],
        };
        annotations.push(newAnnotation);
        renderAnnotations();
        
        floatingMenu.classList.add('hidden');
        window.getSelection().removeAllRanges();
        selectedText = "";
        currentSelectionMeta = null;
    }
}

/**
 * Exports all annotations and their replies to the clipboard in a structured format.
 */
function exportAllComments() {
    if (annotations.length === 0) return;

    let exportText = "";
    
    // Loop through annotations in the order they were added (oldest first)
    // Note: annotations array stores data oldest first, but the rendering is reversed.
    annotations.forEach((ann, index) => {
        const quoteText = ann.text.trim();
        const quoteReplies = ann.replies;
        
        // Format the main quote block
        exportText += `${index + 1}) Annotated Text:\n${quoteText}`;
        
        // Add replies if they exist
        if (quoteReplies.length > 0) {
            exportText += "\nComments/Questions:\n";
            quoteReplies.forEach(reply => {
                exportText += `- ${reply}\n`;
            });
        }
        
        if (index < annotations.length - 1) {
            exportText += "\n\n";
        }
    });

    copyToClipboard(exportText);
    console.log("All comments exported to clipboard.");
}

// --- Highlight Rendering ---

function renderHighlights() {
    // Clear all existing highlight boxes
    document.querySelectorAll('.highlightLayer').forEach(layer => {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
    });

    if (!annotations.length) return;

    annotations.forEach(ann => {
        if (!ann.pageNumber || !Array.isArray(ann.rects)) return;
        const pageLayer = document.querySelector(`.page[data-page-number="${ann.pageNumber}"] .highlightLayer`);
        if (!pageLayer) return;
        ann.rects.forEach(r => {
            const box = document.createElement('div');
            box.className = 'highlightBox';
            box.style.left = `${r.x}px`;
            box.style.top = `${r.y}px`;
            box.style.width = `${r.width}px`;
            box.style.height = `${r.height}px`;
            pageLayer.appendChild(box);
        });
    });
}

// --- Paste Image Handling ---

function updatePasteStatus(message) {
    if (pasteStatus) pasteStatus.textContent = message;
}

function formatFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `pasted-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
}

async function requestSaveDirectory() {
    if (!window.showDirectoryPicker) {
        updatePasteStatus('Directory picker not supported in this browser. Use Chrome/Edge.');
        return null;
    }
    try {
        const dirHandle = await window.showDirectoryPicker();
        saveDirectoryHandle = dirHandle;
        const name = dirHandle.name || 'Selected folder';
        if (saveDirLabel) saveDirLabel.textContent = name;
        updatePasteStatus('Save folder selected. Paste an image to auto-save.');
        return dirHandle;
    } catch (err) {
        console.warn('Directory selection cancelled or failed:', err);
        updatePasteStatus('Save folder not selected. Paste will preview only.');
        return null;
    }
}

async function ensureWritePermission(dirHandle) {
    if (!dirHandle) return false;
    const opts = { mode: 'readwrite' };
    // @ts-ignore
    if (await dirHandle.queryPermission(opts) === 'granted') return true;
    // @ts-ignore
    if (await dirHandle.requestPermission(opts) === 'granted') return true;
    return false;
}

async function autoSaveImage(blob) {
    if (!saveDirectoryHandle) {
        updatePasteStatus('No save folder set. Click "Choose Save Folder" first.');
        return;
    }
    const hasPerm = await ensureWritePermission(saveDirectoryHandle);
    if (!hasPerm) {
        updatePasteStatus('Permission denied for the selected folder.');
        return;
    }
    const filename = formatFilename();
    try {
        const fileHandle = await saveDirectoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        updatePasteStatus(`Saved: ${filename}`);
    } catch (err) {
        console.error('Failed to save image:', err);
        updatePasteStatus('Failed to save image. Check folder permissions.');
    }
}

function showPastedPreview(blob) {
    if (!pastedImage || !pastedImageWrapper || !pastedMeta) return;
    const url = URL.createObjectURL(blob);
    pastedImage.src = url;
    pastedImageWrapper.classList.remove('hidden');
    pastedMeta.textContent = `Size: ${(blob.size / 1024).toFixed(1)} KB • Type: ${blob.type}`;
    pastedMeta.classList.remove('hidden');
    pastedImage.onload = () => {
        URL.revokeObjectURL(url);
    };
}

function getImageFromClipboard(event) {
    if (!event.clipboardData || !event.clipboardData.items) return null;
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find(it => it.type && it.type.startsWith('image/'));
    if (!imageItem) return null;
    const file = imageItem.getAsFile();
    return file || null;
}

async function handlePaste(event) {
    if (currentSection !== 'paste') return;
    const imageFile = getImageFromClipboard(event);
    if (!imageFile) {
        updatePasteStatus('Clipboard does not contain an image. Copy an image then press Ctrl+V.');
        return;
    }
    updatePasteStatus('Image received. Saving...');
    showPastedPreview(imageFile);
    await autoSaveImage(imageFile);
}

if (chooseDirBtn) {
    chooseDirBtn.addEventListener('click', requestSaveDirectory);
}

window.addEventListener('paste', handlePaste);

if (pasteDropzone) {
    pasteDropzone.addEventListener('click', () => {
        updatePasteStatus('Press Ctrl+V with an image copied to clipboard.');
    });
}
