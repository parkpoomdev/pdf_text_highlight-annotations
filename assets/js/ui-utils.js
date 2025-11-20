// UI helpers: modal, escaping, clipboard, drag & drop, etc.

function showModal(message, callback) {
  const modal = document.getElementById('confirmation-modal');
  const messageEl = modal.querySelector('[data-modal-message]');
  const confirmBtn = modal.querySelector('[data-modal-confirm]');
  const cancelBtn = modal.querySelector('[data-modal-cancel]');

  messageEl.textContent = message;
  modal.classList.remove('hidden');

  modalCallback = (result) => {
    modal.classList.add('hidden');
    if (typeof callback === 'function') callback(result);
  };

  const handleConfirm = () => {
    cleanup();
    modalCallback(true);
  };

  const handleCancel = () => {
    cleanup();
    modalCallback(false);
  };

  function cleanup() {
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
  }

  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);
}

function hideModal() {
  const modal = document.getElementById('confirmation-modal');
  modal.classList.add('hidden');
}

// Simple escaping for embedding in onclick attributes
function escapeForOnclick(text) {
  if (!text) return '';
  return String(text).replace(/'/g, "&#39;").replace(/"/g, '&quot;');
}

// Escape for HTML content
function escapeForHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function copyToClipboard(text) {
  if (!navigator.clipboard) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return;
  }
  navigator.clipboard.writeText(text).catch(() => {});
}

function sanitizeText(s) {
  if (!s) return '';
  return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('pdf-drop-zone');
  if (!dropZone) return;

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('drop-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('drop-active');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files[0]) {
      processPdfFile(files[0]);
    }
  });
}
