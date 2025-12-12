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
const isometricSection = document.getElementById('isometric-section');
const isoDropzone = document.getElementById('iso-dropzone');
const isoStatus = document.getElementById('iso-status');
const isoOriginalCanvas = document.getElementById('iso-original-canvas');
const isoOriginalMeta = document.getElementById('iso-original-meta');
const isoOriginalFullBtn = document.getElementById('iso-original-full-btn');
const isoResultsGrid = document.getElementById('iso-results-grid');
const isoClearBtn = document.getElementById('iso-clear-btn');

let currentSection = 'pdf';
let saveDirectoryHandle = null;
const sectionMap = {
    pdf: pdfSection,
    text: textSection,
    paste: pasteSection,
    isometric: isometricSection,
    export: exportSection,
};

const ISO_SCALE_Y = Math.cos(Math.PI / 6);
const ISO_SHEAR_K = Math.tan(Math.PI / 6);
const ISO_PAD = 8;
const ISO_WIDTH_VARIANTS = [
    { key: 'very_narrow', label: 'Very narrow', factor: 0.6 },
    { key: 'narrow', label: 'Narrow', factor: 0.8 },
    { key: 'medium', label: 'Medium', factor: 1.0 },
    { key: 'wide', label: 'Wide', factor: 1.25 },
];
let isoResults = [];
let isoOriginalDataUrl = '';

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
 * Copies text to the clipboard using the modern Clipboard API.
 * Falls back to execCommand for older browsers.
 * @param {string} text 
 */
function copyToClipboard(text) {
    console.log('copyToClipboard called with text:', text.substring(0, 100));
    
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Text copied to clipboard successfully using Clipboard API');
            showSuccessPopup('Text copied to clipboard!');
        }).catch(err => {
            console.error('Clipboard API failed, falling back to execCommand:', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        // Fallback for older browsers
        console.log('Clipboard API not available, using fallback');
        fallbackCopyToClipboard(text);
    }
}

/**
 * Fallback method using execCommand for older browsers.
 * @param {string} text 
 */
function fallbackCopyToClipboard(text) {
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
        if (successful) {
            showSuccessPopup('Text copied to clipboard!');
        } else {
            console.error('execCommand copy returned false');
        }
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
        // Save PDF to localStorage
        savePdfToStorage(file.name, pdfData);
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
    const pdf = new jsPDF({ 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait',
        compress: true
    });
    // Set margins to 0
    pdf.setProperties({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    
    for (let i = 0; i < spreads.length; i++) {
        const spread = spreads[i];
        const canvas = await html2canvas(spread, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            removeContainer: true,
        });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) {
            pdf.addPage();
        }
        // Full A4 size: 210mm x 297mm with 0mm margins
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
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
            spread.className = 'export-spread bg-white';
            spread.style.margin = '0';
            spread.style.padding = '0';

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
    row.className = 'export-row grid items-stretch grid-cols-1 lg:grid-cols-[70%_30%]';
    row.style.margin = '0';
    row.style.padding = '0';
    row.style.gap = '0';
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });

    const previewCol = document.createElement('div');
    previewCol.style.margin = '0';
    previewCol.style.padding = '0';
    previewCol.style.width = '100%';
    previewCol.style.height = '100%';

    const previewWrapper = document.createElement('div');
    previewWrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    previewWrapper.style.width = '100%';
    previewWrapper.style.height = '100%';
    previewWrapper.style.display = 'block';
    previewWrapper.style.margin = '0';
    previewWrapper.style.padding = '0';

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
    commentCol.style.margin = '0';
    commentCol.style.padding = '0';
    commentCol.style.width = '100%';
    commentCol.style.height = '100%';
    commentCol.innerHTML = `<p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Comments</p>`;

    row.appendChild(previewCol);
    row.appendChild(commentCol);
    return row;
}

// --- PDF Persistence Functions ---

/**
 * Saves PDF file to localStorage
 * @param {string} filename - Name of the PDF file
 * @param {Uint8Array} pdfData - PDF file data
 */
function savePdfToStorage(filename, pdfData) {
    try {
        // Convert Uint8Array to base64 for storage (handle large files)
        let base64String = '';
        const chunkSize = 0x8000; // 32KB chunks to avoid call stack overflow
        for (let i = 0; i < pdfData.length; i += chunkSize) {
            const chunk = pdfData.subarray(i, i + chunkSize);
            base64String += String.fromCharCode.apply(null, chunk);
        }
        base64String = btoa(base64String);
        
        localStorage.setItem('pdf_filename', filename);
        localStorage.setItem('pdf_data', base64String);
        localStorage.setItem('pdf_timestamp', Date.now().toString());
        console.log('PDF saved to localStorage:', filename, 'Size:', (base64String.length / 1024).toFixed(2), 'KB');
    } catch (e) {
        console.error('Error saving PDF to localStorage:', e);
        // If storage quota exceeded, try to clear old data
        if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
            console.warn('Storage quota exceeded, clearing old PDF data');
            localStorage.removeItem('pdf_data');
            localStorage.removeItem('pdf_filename');
            localStorage.removeItem('pdf_timestamp');
        }
    }
}

/**
 * Loads PDF from localStorage
 * @returns {Uint8Array|null} PDF data or null if not found
 */
function loadPdfFromStorage() {
    try {
        const pdfDataBase64 = localStorage.getItem('pdf_data');
        const filename = localStorage.getItem('pdf_filename');
        if (!pdfDataBase64 || !filename) {
            console.log('No saved PDF found in localStorage');
            return null;
        }
        
        // Convert base64 back to Uint8Array
        const binaryString = atob(pdfDataBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        console.log('PDF loaded from localStorage:', filename, 'Size:', (bytes.length / 1024).toFixed(2), 'KB');
        return { data: bytes, filename: filename };
    } catch (e) {
        console.error('Error loading PDF from localStorage:', e);
        // Clear corrupted data
        localStorage.removeItem('pdf_data');
        localStorage.removeItem('pdf_filename');
        localStorage.removeItem('pdf_timestamp');
        return null;
    }
}

/**
 * Clears saved PDF from localStorage
 */
function clearPdfFromStorage() {
    localStorage.removeItem('pdf_data');
    localStorage.removeItem('pdf_filename');
    localStorage.removeItem('pdf_timestamp');
    console.log('PDF cleared from localStorage');
}

/**
 * Saves annotations to localStorage
 */
function saveAnnotationsToStorage() {
    try {
        const annotationsJson = JSON.stringify(annotations);
        localStorage.setItem('annotations', annotationsJson);
        localStorage.setItem('annotations_timestamp', Date.now().toString());
        console.log(`Saved ${annotations.length} annotations to localStorage (${annotationsJson.length} bytes)`);
    } catch (e) {
        console.error('Error saving annotations to localStorage:', e);
    }
}

/**
 * Loads annotations from localStorage
 */
function loadAnnotationsFromStorage() {
    try {
        const savedAnnotations = localStorage.getItem('annotations');
        if (savedAnnotations) {
            annotations = JSON.parse(savedAnnotations);
            console.log(`Loaded ${annotations.length} annotations from localStorage`);
            renderAnnotations();
            return true;
        } else {
            console.log('No saved annotations found in localStorage');
        }
    } catch (e) {
        console.error('Error loading annotations from localStorage:', e);
    }
    return false;
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
        
        // Add resize handler to recalculate page scales
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(async () => {
                if (pdfDoc && pdfContainer) {
                    const pages = pdfContainer.querySelectorAll('.page');
                    for (const pageWrapper of pages) {
                        const pageNum = parseInt(pageWrapper.dataset.pageNumber);
                        if (pageNum) {
                            // Remove old page
                            pageWrapper.remove();
                            // Re-render with new scale
                            await renderPage(pdfDoc, pageNum);
                        }
                    }
                    // Re-render highlights after resize
                    renderHighlights();
                }
            }, 300);
        });
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
    
    // Calculate scale based on available container width
    const pdfContainer = document.getElementById('pdf-container');
    const containerWidth = pdfContainer ? pdfContainer.clientWidth - 40 : 800; // Subtract padding
    const baseViewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(1.5, containerWidth / baseViewport.width);
    const viewport = page.getViewport({ scale: scale });

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page relative mx-auto my-4';
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.maxWidth = '100%';
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
    if (!commentsList) {
        console.error('commentsList element not found!');
        return;
    }
    
    commentsList.innerHTML = '';
    
    if (annotations.length === 0) {
        commentsList.innerHTML = '<p id="no-comments" class="text-gray-400 italic text-sm">No annotations added yet. Select text in the PDF to start annotating.</p>';
        exportAllBtn.disabled = true;
        // still clear highlights
        renderHighlights();
        return;
    }

    exportAllBtn.disabled = false;
    console.log(`Rendering ${annotations.length} annotations`);
    
    // Sort by visual position: page asc, then top (y) asc, then left (x) asc
    const sortedAnnotations = annotations.slice().sort((a, b) => {
        const pageA = a.pageNumber || 0;
        const pageB = b.pageNumber || 0;
        if (pageA !== pageB) return pageA - pageB;
        const aRect = Array.isArray(a.rects) && a.rects.length ? a.rects[0] : { y: 0, x: 0 };
        const bRect = Array.isArray(b.rects) && b.rects.length ? b.rects[0] : { y: 0, x: 0 };
        if (aRect.y !== bRect.y) return aRect.y - bRect.y;
        if (aRect.x !== bRect.x) return aRect.x - bRect.x;
        return a.id - b.id; // stable fallback
    });
    
        sortedAnnotations.forEach(ann => {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment-highlight group cursor-pointer'; 
        commentDiv.setAttribute('data-id', ann.id);
        commentDiv.title = 'Click to jump to highlight in PDF';
        commentDiv.addEventListener('click', function(e) {
            // Don't trigger if clicking on buttons or inputs
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('input')) {
                return;
            }
            scrollToHighlight(ann.id);
        });

        const safeTextForDisplay = escapeForHtml(ann.text);
        
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
                <div class="flex space-x-1">
                    <button onclick="showExportTemplateModal(${ann.id})" 
                            class="p-2 rounded hover:bg-indigo-50 text-indigo-600" title="Copy">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button onclick="deleteAnnotation(${ann.id})" 
                            class="p-2 rounded hover:bg-red-50 text-red-600" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                        </svg>
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
        saveAnnotationsToStorage();
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
        const deletedReply = annotation.replies[replyIndex];
        annotation.replies.splice(replyIndex, 1);
        console.log(`Deleted reply ${replyIndex} from annotation ${annotationId}`);
        renderAnnotations();
        saveAnnotationsToStorage();
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
        saveAnnotationsToStorage();
    }
}


function addReply(annotationId) {
    const replyInput = document.getElementById(`reply-input-${annotationId}`);
    const replyText = replyInput.value.trim();

    if (replyText) {
        const annotation = annotations.find(ann => ann.id === annotationId);
        if (annotation) {
            annotation.replies.push(replyText);
            console.log(`Added reply to annotation ${annotationId}: "${replyText.substring(0, 50)}..."`);
            replyInput.value = '';
            renderAnnotations();
            saveAnnotationsToStorage();
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
        console.log(`Added annotation: "${selectedText.substring(0, 50)}..." (ID: ${newAnnotation.id})`);
        renderAnnotations();
        saveAnnotationsToStorage();
        
        floatingMenu.classList.add('hidden');
        window.getSelection().removeAllRanges();
        selectedText = "";
        currentSelectionMeta = null;
    } else {
        console.log('No text selected for annotation');
    }
}

// Flag to track if export template modal event listener is set up
let exportTemplateModalSetup = false;

/**
 * Shows the export template selection modal.
 * @param {number} annotationId - Optional annotation ID for single annotation export
 */
function showExportTemplateModal(annotationId = null) {
    if (annotationId === null && annotations.length === 0) {
        console.warn('showExportTemplateModal called but no annotations found');
        return;
    }
    
    const modal = document.getElementById('export-template-modal');
    if (!modal) {
        console.error('export-template-modal element not found in HTML');
        return;
    }
    
    console.log(`Showing export template modal for annotation: ${annotationId || 'all'}`);
    
    // Store annotationId for later use
    modal.dataset.annotationId = annotationId || '';
    
    // Reset all feedback messages and active states when showing modal
    document.querySelectorAll('.export-template-card').forEach(card => {
        // Reset active states
        card.classList.remove('border-indigo-600', 'bg-indigo-100', 'ring-2', 'ring-indigo-500', 'active');
        // Reset feedback messages - clear inline styles and reset opacity
        const feedbackEl = card.querySelector('.copy-feedback');
        if (feedbackEl) {
            feedbackEl.style.display = '';
            feedbackEl.style.visibility = '';
            feedbackEl.style.opacity = '';
            feedbackEl.classList.remove('opacity-100');
            feedbackEl.classList.add('opacity-0');
        }
    });
    
    // Set up event delegation once
    if (!exportTemplateModalSetup) {
        modal.addEventListener('click', function(e) {
            const card = e.target.closest('.export-template-card');
            if (card) {
                e.stopPropagation(); // Prevent event bubbling
                const template = parseInt(card.dataset.template);
                const annId = modal.dataset.annotationId;
                
                console.log(`Template ${template} selected for annotation: ${annId || 'all'}`);
                
                // Show active state - remove from all cards first
                document.querySelectorAll('.export-template-card').forEach(c => {
                    c.classList.remove('border-indigo-600', 'bg-indigo-100', 'ring-2', 'ring-indigo-500', 'active');
                    // Hide all feedback messages
                    const fb = c.querySelector('.copy-feedback');
                    if (fb) {
                        fb.classList.remove('opacity-100');
                        fb.classList.add('opacity-0');
                    }
                });
                // Add active state to selected card
                card.classList.add('border-indigo-600', 'bg-indigo-100', 'ring-2', 'ring-indigo-500', 'active');
                
                // Show "Text copy to clipboard" message
                const feedbackEl = card.querySelector('.copy-feedback');
                if (feedbackEl) {
                    // Force display and visibility
                    feedbackEl.style.display = 'block';
                    feedbackEl.style.visibility = 'visible';
                    feedbackEl.style.opacity = '1';
                    feedbackEl.classList.remove('opacity-0');
                    feedbackEl.classList.add('opacity-100');
                }
                
                // Export immediately
                if (annId) {
                    exportSingleAnnotation(parseInt(annId), template);
                } else {
                    exportAllComments(template);
                }
                
                // Close modal immediately
                hideExportTemplateModal();
                
                // Fade out the feedback message after a short delay (while modal is closing)
                setTimeout(() => {
                    if (feedbackEl) {
                        feedbackEl.classList.remove('opacity-100');
                        feedbackEl.classList.add('opacity-0');
                    }
                }, 1500);
            }
        });
        exportTemplateModalSetup = true;
    }
    
    modal.classList.remove('hidden');
}

/**
 * Hides the export template selection modal.
 */
function hideExportTemplateModal() {
    const modal = document.getElementById('export-template-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    
    // Reset active states and feedback messages - clear inline styles
    document.querySelectorAll('.export-template-card').forEach(card => {
        card.classList.remove('border-indigo-600', 'bg-indigo-100', 'ring-2', 'ring-indigo-500', 'active');
        const feedbackEl = card.querySelector('.copy-feedback');
        if (feedbackEl) {
            feedbackEl.style.display = '';
            feedbackEl.style.visibility = '';
            feedbackEl.style.opacity = '';
            feedbackEl.classList.remove('opacity-100');
            feedbackEl.classList.add('opacity-0');
        }
    });
}

/**
 * Shows the success popup modal.
 */
function showSuccessPopup(message) {
    const modal = document.getElementById('success-popup-modal');
    const messageEl = document.getElementById('success-popup-message');
    if (messageEl) {
        messageEl.textContent = message || 'All text is already copy to clipboard';
    }
    if (modal) {
        modal.classList.remove('hidden');
        // Auto-hide after 3 seconds
        setTimeout(() => {
            hideSuccessPopup();
        }, 3000);
    }
}

/**
 * Hides the success popup modal.
 */
function hideSuccessPopup() {
    const modal = document.getElementById('success-popup-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Exports all annotations and their replies to the clipboard in a structured format.
 * @param {number} template - Template number (1-4). If not provided, shows modal.
 */
function exportAllComments(template) {
    if (annotations.length === 0) return;
    
    // If no template specified, show modal
    if (!template) {
        showExportTemplateModal();
        return;
    }

    // Sort annotations by page number
    const sortedAnnotations = annotations.slice().sort((a, b) => {
        const pageA = a.pageNumber || 0;
        const pageB = b.pageNumber || 0;
        if (pageA !== pageB) {
            return pageA - pageB;
        }
        return a.id - b.id;
    });

    let exportText = "";
    
    sortedAnnotations.forEach((ann, index) => {
        const quoteText = ann.text.trim();
        const quoteReplies = ann.replies;
        const pageNumber = ann.pageNumber || 0;
        
        // Format based on selected template
        switch(template) {
            case 1:
                // Template 1: Original format
                exportText += `${index + 1}) Annotated Text:\n${quoteText}`;
                if (quoteReplies.length > 0) {
                    exportText += "\nComments/Questions:\n";
                    quoteReplies.forEach(reply => {
                        exportText += `- ${reply}\n`;
                    });
                }
                break;
            case 2:
                // Template 2: With quotes
                exportText += `${index + 1}) "${quoteText}"`;
                if (quoteReplies.length > 0) {
                    exportText += "\n\nComments/Questions:\n";
                    quoteReplies.forEach(reply => {
                        exportText += `- ${reply}\n`;
                    });
                }
                break;
            case 3:
                // Template 3: With ellipsis quotes
                exportText += `${index + 1}) "...${quoteText}..."`;
                if (quoteReplies.length > 0) {
                    exportText += "\n\nComments/Questions:\n";
                    quoteReplies.forEach(reply => {
                        exportText += `- ${reply}\n`;
                    });
                }
                break;
            case 4:
                // Template 4: With ellipsis quotes and page number
                exportText += `${index + 1}) "...${quoteText}..."`;
                if (quoteReplies.length > 0) {
                    exportText += "\n\nComments/Questions:\n";
                    quoteReplies.forEach(reply => {
                        exportText += `- ${reply}\n`;
                    });
                }
                if (pageNumber > 0) {
                    exportText += `\nPage ${pageNumber}`;
                }
                break;
            default:
                // Default to template 1
                exportText += `${index + 1}) Annotated Text:\n${quoteText}`;
                if (quoteReplies.length > 0) {
                    exportText += "\nComments/Questions:\n";
                    quoteReplies.forEach(reply => {
                        exportText += `- ${reply}\n`;
                    });
                }
        }
        
        if (index < sortedAnnotations.length - 1) {
            exportText += "\n\n";
        }
    });

    copyToClipboard(exportText);
    console.log(`All comments exported to clipboard using template ${template}.`);
}

/**
 * Exports a single annotation using the specified template.
 * @param {number} annotationId - The ID of the annotation to export
 * @param {number} template - Template number (1-4)
 */
function exportSingleAnnotation(annotationId, template) {
    const annotation = annotations.find(ann => ann.id === annotationId);
    if (!annotation) {
        console.error(`Annotation with ID ${annotationId} not found`);
        return;
    }

    const quoteText = annotation.text.trim();
    const quoteReplies = annotation.replies;
    const pageNumber = annotation.pageNumber || 0;
    
    let exportText = "";
    
    // Format based on selected template
    switch(template) {
        case 1:
            // Template 1: Original format
            exportText += `1) Annotated Text:\n${quoteText}`;
            if (quoteReplies.length > 0) {
                exportText += "\nComments/Questions:\n";
                quoteReplies.forEach(reply => {
                    exportText += `- ${reply}\n`;
                });
            }
            break;
        case 2:
            // Template 2: With quotes
            exportText += `1) "${quoteText}"`;
            if (quoteReplies.length > 0) {
                exportText += "\n\nComments/Questions:\n";
                quoteReplies.forEach(reply => {
                    exportText += `- ${reply}\n`;
                });
            }
            break;
        case 3:
            // Template 3: With ellipsis quotes
            exportText += `1) "...${quoteText}..."`;
            if (quoteReplies.length > 0) {
                exportText += "\n\nComments/Questions:\n";
                quoteReplies.forEach(reply => {
                    exportText += `- ${reply}\n`;
                });
            }
            break;
        case 4:
            // Template 4: With ellipsis quotes and page number
            exportText += `1) "...${quoteText}..."`;
            if (quoteReplies.length > 0) {
                exportText += "\n\nComments/Questions:\n";
                quoteReplies.forEach(reply => {
                    exportText += `- ${reply}\n`;
                });
            }
            if (pageNumber > 0) {
                exportText += `\nPage ${pageNumber}`;
            }
            break;
        default:
            // Default to template 1
            exportText += `1) Annotated Text:\n${quoteText}`;
            if (quoteReplies.length > 0) {
                exportText += "\nComments/Questions:\n";
                quoteReplies.forEach(reply => {
                    exportText += `- ${reply}\n`;
                });
            }
    }

    console.log(`Exporting annotation ${annotationId} using template ${template}. Text: "${quoteText.substring(0, 50)}..."`);
    copyToClipboard(exportText);
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
            box.dataset.annotationId = ann.id;
            box.style.left = `${r.x}px`;
            box.style.top = `${r.y}px`;
            box.style.width = `${r.width}px`;
            box.style.height = `${r.height}px`;
            pageLayer.appendChild(box);
        });
    });
}

/**
 * Scrolls to the highlight in the PDF viewer for the given annotation
 * @param {number} annotationId - The ID of the annotation to scroll to
 */
function scrollToHighlight(annotationId) {
    const annotation = annotations.find(ann => ann.id === annotationId);
    if (!annotation || !annotation.pageNumber) return;

    // Find the page wrapper
    const pageWrapper = document.querySelector(`.page[data-page-number="${annotation.pageNumber}"]`);
    if (!pageWrapper) return;

    // Scroll the PDF container to show the page
    if (pdfContainer) {
        // Calculate the position to scroll to (center of the first highlight rect)
        const firstRect = annotation.rects && annotation.rects[0];
        if (firstRect) {
            const pageRect = pageWrapper.getBoundingClientRect();
            const containerRect = pdfContainer.getBoundingClientRect();
            const scrollTop = pdfContainer.scrollTop;
            const targetY = scrollTop + pageRect.top - containerRect.top + firstRect.y + (firstRect.height / 2) - (containerRect.height / 2);
            
            pdfContainer.scrollTo({
                top: Math.max(0, targetY),
                behavior: 'smooth'
            });
        } else {
            // If no rects, just scroll to the page
            pageWrapper.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    // Add a visual pulse effect to the highlight
    const highlightBoxes = document.querySelectorAll(`.highlightBox[data-annotation-id="${annotationId}"]`);
    highlightBoxes.forEach(box => {
        box.style.transition = 'all 0.3s ease';
        box.style.background = 'rgba(250, 204, 21, 0.6)';
        box.style.boxShadow = '0 0 0 2px rgba(250, 204, 21, 0.8)';
        
        setTimeout(() => {
            box.style.background = '';
            box.style.boxShadow = '';
        }, 2000);
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

async function handlePasteForStorage(event) {
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

function updateIsoStatus(message) {
    if (!isoStatus) return;
    isoStatus.textContent = message;
}

function updateOriginalPreview(sourceCanvas) {
    if (!isoOriginalCanvas || !isoOriginalMeta || !sourceCanvas) return;
    isoOriginalCanvas.classList.remove('hidden');
    isoOriginalCanvas.width = sourceCanvas.width;
    isoOriginalCanvas.height = sourceCanvas.height;
    const ctx = isoOriginalCanvas.getContext('2d');
    if (ctx) {
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, isoOriginalCanvas.width, isoOriginalCanvas.height);
        ctx.drawImage(sourceCanvas, 0, 0);
    }
    isoOriginalMeta.textContent = `Original size: ${sourceCanvas.width} × ${sourceCanvas.height}`;
    isoOriginalMeta.classList.remove('hidden');
    isoOriginalCanvas.style.maxWidth = '25%';
    isoOriginalCanvas.style.height = 'auto';
    isoOriginalCanvas.style.margin = '0 auto';
    isoOriginalDataUrl = isoOriginalCanvas.toDataURL('image/png');
    if (isoOriginalFullBtn) {
        isoOriginalFullBtn.disabled = false;
    }
    prepareCanvasPreview(isoOriginalCanvas, '45vh');
}

function openIsoOriginalFullSize() {
    if (!isoOriginalCanvas) return;
    let url = isoOriginalDataUrl;
    if (!url) {
        url = isoOriginalCanvas.toDataURL('image/png');
    }
    if (!url) return;
    window.open(url, '_blank');
    updateIsoStatus('Full-resolution image opened in a new tab.');
}

function prepareCanvasPreview(canvas, maxHeight = '30vh') {
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.maxHeight = maxHeight;
}

function scaleCanvas(source, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(targetWidth));
    canvas.height = Math.max(1, Math.round(targetHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function autocropCanvas(canvas, pad = ISO_PAD) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 4) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
            }
        }
    }
    if (x1 <= x0 || y1 <= y0) return canvas;
    const cropX0 = Math.max(0, x0 - pad);
    const cropY0 = Math.max(0, y0 - pad);
    const cropX1 = Math.min(width, x1 + pad);
    const cropY1 = Math.min(height, y1 + pad);
    const cropWidth = cropX1 - cropX0;
    const cropHeight = cropY1 - cropY0;
    if (cropWidth <= 0 || cropHeight <= 0) return canvas;
    const cropped = document.createElement('canvas');
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    const cropCtx = cropped.getContext('2d');
    if (!cropCtx) return canvas;
    cropCtx.drawImage(canvas, cropX0, cropY0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return cropped;
}

function shearVertical(source, k, direction) {
    const offset = Math.round(k * source.width);
    const newHeight = source.height + offset;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = Math.max(1, newHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.imageSmoothingQuality = 'high';
    if (direction === 'up') {
        ctx.setTransform(1, k, 0, 1, 0, 0);
        ctx.drawImage(source, 0, 0);
    } else {
        ctx.setTransform(1, -k, 0, 1, 0, offset);
        ctx.drawImage(source, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return autocropCanvas(canvas);
}

function shearHorizontal(source, k, direction) {
    const offset = Math.round(k * source.height);
    const newWidth = source.width + offset;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, newWidth);
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.imageSmoothingQuality = 'high';
    if (direction === 'right') {
        ctx.setTransform(1, 0, k, 1, 0, 0);
        ctx.drawImage(source, 0, 0);
    } else {
        ctx.setTransform(1, 0, -k, 1, offset, 0);
        ctx.drawImage(source, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return autocropCanvas(canvas);
}

function rotateCanvas(source, degrees) {
    const radians = (degrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    const newWidth = Math.ceil(source.width * cos + source.height * sin);
    const newHeight = Math.ceil(source.width * sin + source.height * cos);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, newWidth);
    canvas.height = Math.max(1, newHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return autocropCanvas(canvas);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return autocropCanvas(canvas);
}

async function processIsometricImage(file) {
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = bitmap.width;
    baseCanvas.height = bitmap.height;
    const baseCtx = baseCanvas.getContext('2d');
    if (baseCtx) {
        baseCtx.imageSmoothingQuality = 'high';
        baseCtx.drawImage(bitmap, 0, 0);
    }
    bitmap.close();
    updateOriginalPreview(baseCanvas);

    const results = [];
    ISO_WIDTH_VARIANTS.forEach(variant => {
        const scaledWidth = Math.max(1, Math.round(baseCanvas.width * variant.factor));
        const scaled = scaleCanvas(baseCanvas, scaledWidth, baseCanvas.height);
        const isoHeight = Math.max(1, Math.round(scaled.height * ISO_SCALE_Y));
        const isoScaled = scaleCanvas(scaled, scaled.width, isoHeight);

        const up = shearVertical(isoScaled, ISO_SHEAR_K, 'up');
        const down = shearVertical(isoScaled, ISO_SHEAR_K, 'down');
        const left = shearHorizontal(isoScaled, ISO_SHEAR_K, 'left');
        const right = shearHorizontal(isoScaled, ISO_SHEAR_K, 'right');
        const leftRot = rotateCanvas(left, -30);
        const rightRot = rotateCanvas(right, -30);

        results.push({ variant: variant.label, direction: 'Left CCW 30deg', canvas: leftRot });
        results.push({ variant: variant.label, direction: 'Right CCW 30deg', canvas: rightRot });
        results.push({ variant: variant.label, direction: 'Shear Up', canvas: up });
        results.push({ variant: variant.label, direction: 'Shear Down', canvas: down });
        results.push({ variant: variant.label, direction: 'Shear Left', canvas: left });
        results.push({ variant: variant.label, direction: 'Shear Right', canvas: right });
    });

    isoResults = results;
    renderIsometricResults();
    updateIsoStatus('Isometric conversion ready. Download any variant below.');
}

function renderIsometricResults() {
    if (!isoResultsGrid) return;
    isoResultsGrid.innerHTML = '';
    if (isoResults.length === 0) {
        isoResultsGrid.innerHTML = '<p class="text-sm text-gray-500">Paste an image in this tab to preview the isometric projections.</p>';
        setIsometricClearState(false);
        return;
    }
    setIsometricClearState(true);
    isoResults.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'rounded-2xl border border-gray-200 bg-white p-3 flex flex-col gap-3 shadow-sm';

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between text-xs text-gray-500 tracking-wide uppercase';
        header.innerHTML = `<span>${entry.direction}</span><span>${entry.variant}</span>`;

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'overflow-hidden rounded-xl border border-indigo-50 bg-white';
        entry.canvas.className = 'w-full';
        prepareCanvasPreview(entry.canvas, '32vh');
        canvasWrapper.appendChild(entry.canvas);

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-2';
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'flex-1 text-xs font-semibold border border-indigo-200 rounded-full py-1 px-3 text-indigo-600 hover:bg-indigo-50 transition';
        downloadBtn.textContent = 'Download PNG';
        downloadBtn.addEventListener('click', () => {
            const filename = `isometric_${entry.variant.replace(/\s+/g, '_').toLowerCase()}_${entry.direction.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.png`;
            downloadCanvasAsPng(entry.canvas, filename);
        });
        actions.appendChild(downloadBtn);

        card.appendChild(header);
        card.appendChild(canvasWrapper);
        card.appendChild(actions);
        isoResultsGrid.appendChild(card);
    });
}

function downloadCanvasAsPng(canvas, filename) {
    canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}

function setIsometricClearState(enabled) {
    if (!isoClearBtn) return;
    isoClearBtn.disabled = !enabled;
    isoClearBtn.classList.toggle('bg-indigo-500', enabled);
    isoClearBtn.classList.toggle('hover:bg-indigo-600', enabled);
    isoClearBtn.classList.toggle('text-white', enabled);
    isoClearBtn.classList.toggle('shadow-md', enabled);
    isoClearBtn.classList.toggle('bg-gray-200', !enabled);
    isoClearBtn.classList.toggle('text-gray-600', !enabled);
    isoClearBtn.classList.toggle('shadow-inner', !enabled);
}

function clearIsometricResults() {
    isoResults = [];
    if (isoOriginalCanvas) isoOriginalCanvas.classList.add('hidden');
    if (isoOriginalMeta) isoOriginalMeta.classList.add('hidden');
    isoOriginalDataUrl = '';
    if (isoOriginalFullBtn) {
        isoOriginalFullBtn.disabled = true;
    }
    renderIsometricResults();
    updateIsoStatus('Waiting for image from clipboard...');
}

function handleClipboardEvent(event) {
    handlePasteForStorage(event);
    handleIsometricPaste(event);
}

async function handleIsometricPaste(event) {
    if (currentSection !== 'isometric') return;
    const imageFile = getImageFromClipboard(event);
    if (!imageFile) {
        updateIsoStatus('Clipboard does not contain an image. Copy an image then press Ctrl+V.');
        return;
    }
    updateIsoStatus('Processing image...');
    try {
        await processIsometricImage(imageFile);
    } catch (err) {
        console.error('Isometric conversion failed', err);
        updateIsoStatus('Unable to process image. Check the console for details.');
    }
}

if (chooseDirBtn) {
    chooseDirBtn.addEventListener('click', requestSaveDirectory);
}

window.addEventListener('paste', handleClipboardEvent);

if (pasteDropzone) {
    pasteDropzone.addEventListener('click', () => {
        updatePasteStatus('Press Ctrl+V with an image copied to clipboard.');
    });
}

if (isoDropzone) {
    isoDropzone.addEventListener('click', () => {
        updateIsoStatus('Press Ctrl+V with an image copied to clipboard to start the conversion.');
    });
}

if (isoClearBtn) {
    isoClearBtn.addEventListener('click', clearIsometricResults);
}

if (isoOriginalFullBtn) {
    isoOriginalFullBtn.addEventListener('click', openIsoOriginalFullSize);
}

clearIsometricResults();

// --- Initialize: Load saved PDF and annotations on page load ---
// Wait for DOM to be fully ready
(function initializeSavedData() {
    // Use a small delay to ensure all DOM elements are available
    setTimeout(async function() {
        // Load saved PDF
        const savedPdf = loadPdfFromStorage();
        if (savedPdf && savedPdf.data) {
            console.log('Restoring PDF:', savedPdf.filename);
            if (appContainer) appContainer.style.display = 'grid';
            if (pdfContainer) pdfContainer.innerHTML = '';
            if (loader) loader.classList.remove('hidden');
            try {
                await renderPDF(savedPdf.data);
            } catch (err) {
                console.error('Error restoring PDF:', err);
                if (loader) loader.classList.add('hidden');
                // Clear corrupted data
                clearPdfFromStorage();
            }
        }
        
        // Load saved annotations
        loadAnnotationsFromStorage();
    }, 100);
})();
