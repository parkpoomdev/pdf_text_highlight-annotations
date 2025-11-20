// Global state and shared DOM references

// PDF.js worker config
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Core global state
let pdfDoc = null;
let selectedText = '';
let annotations = []; // Array of annotations + replies
let currentSelectionMeta = null; // { pageNumber, rects: [{x,y,width,height}] }

// Shared DOM elements (resolved on load)
const pdfContainer = document.getElementById('pdf-container');
const commentsList = document.getElementById('comments-list');
const floatingMenu = document.getElementById('floating-menu');
const loader = document.getElementById('loader');
const appContainer = document.getElementById('app-container');
const exportAllBtn = document.getElementById('export-all-btn');

// Modal callback holder
let modalCallback = null;
