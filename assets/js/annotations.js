// Annotation list, replies, and highlight rendering

function renderAnnotations() {
  if (!commentsList) return;
  commentsList.innerHTML = '';

  const hasAnnotations = annotations.length > 0;
  if (exportAllBtn) {
    exportAllBtn.disabled = !hasAnnotations;
  }

  if (!hasAnnotations) {
    renderEmptyState();
    renderHighlights();
    return;
  }

  annotations.forEach((ann) => {
    const li = document.createElement('li');
    li.className = 'comment-highlight';

    // Header row: label + actions (delete)
    const headerRow = document.createElement('div');
    headerRow.className = 'flex justify-between items-start mb-1';

    const labelEl = document.createElement('div');
    labelEl.className = 'text-xs text-gray-500 font-mono';
    labelEl.textContent = 'Annotated Text:';

    const actionsEl = document.createElement('div');
    actionsEl.className = 'flex space-x-2';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-xs text-red-500 hover:text-red-700 font-medium py-1 px-2 rounded transition duration-150';
    deleteBtn.textContent = 'Delete Annotation';
    deleteBtn.addEventListener('click', () => {
      // simple confirm; could use modal if you prefer
      if (confirm('Delete this annotation and its comments?')) {
        annotations = annotations.filter(a => a.id !== ann.id);
        renderAnnotations();
      }
    });

    actionsEl.appendChild(deleteBtn);
    headerRow.appendChild(labelEl);
    headerRow.appendChild(actionsEl);
    li.appendChild(headerRow);

    // Highlighted text preview
    const textEl = document.createElement('div');
    textEl.className = 'comment-text';
    textEl.textContent = ann.text;
    li.appendChild(textEl);

    // Editable comment input (เหมือนเดิมที่ให้พิมพ์คอมเมนต์ใน panel)
    const commentWrapper = document.createElement('div');
    commentWrapper.className = 'mt-2 flex flex-col gap-1';

    const commentLabel = document.createElement('label');
    commentLabel.className = 'text-xs text-gray-500';
    commentLabel.textContent = 'Comment:';

    const commentInput = document.createElement('textarea');
    commentInput.className = 'mt-1 w-full text-sm border-b border-gray-300 bg-transparent p-1 focus:outline-none focus:border-indigo-500 resize-none';
    commentInput.rows = 1;
    commentInput.placeholder = 'Type a comment and press Enter...';

    // ใช้ช่องนี้เป็นที่พิมพ์คอมเมนต์ "ต่อท้าย" (append) ไปยัง replies
    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const value = commentInput.value.trim();
        if (!value) return;

        if (!Array.isArray(ann.replies)) ann.replies = [];
        ann.replies.push(value);
        commentInput.value = '';
        // re-render to show new reply under this annotation
        renderAnnotations();
      }
    });

    commentWrapper.appendChild(commentLabel);
    commentWrapper.appendChild(commentInput);
    li.appendChild(commentWrapper);

    // Simple replies list (if any)
    if (ann.replies && ann.replies.length) {
      const repliesUl = document.createElement('ul');
      repliesUl.className = 'reply-list mt-2 space-y-1';
      ann.replies.forEach((reply, idx) => {
        const rLi = document.createElement('li');
        rLi.className = 'flex items-center justify-between';

        const textSpan = document.createElement('span');
        textSpan.textContent = reply;

        const delBtn = document.createElement('button');
        delBtn.className = 'ml-2 text-xs text-red-400 hover:text-red-600';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => {
          ann.replies.splice(idx, 1);
          renderAnnotations();
        });

        rLi.appendChild(textSpan);
        rLi.appendChild(delBtn);
        repliesUl.appendChild(rLi);
      });
      li.appendChild(repliesUl);
    }

    commentsList.appendChild(li);
  });

  renderHighlights();
}

function renderEmptyState() {
  if (!commentsList) return;
  const emptyMessage = document.createElement('p');
  emptyMessage.id = 'no-comments';
  emptyMessage.className = 'text-gray-400 italic text-sm';
  emptyMessage.textContent = 'No annotations added yet. Select text in the PDF to start annotating.';
  commentsList.appendChild(emptyMessage);
}

function renderHighlights() {
  if (!pdfContainer) return;

  const pages = pdfContainer.querySelectorAll('.page');
  pages.forEach((pageEl) => {
    const layer = pageEl.querySelector('.highlightLayer');
    if (!layer) return;
    layer.innerHTML = '';
  });

  annotations.forEach((ann) => {
    const pageEl = pdfContainer.querySelector(`.page[data-page-number="${ann.pageNumber}"]`);
    if (!pageEl) return;
    const layer = pageEl.querySelector('.highlightLayer');
    if (!layer) return;

    ann.rects.forEach((rect) => {
      const box = document.createElement('div');
      box.className = 'highlightBox';
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      layer.appendChild(box);
    });
  });
}

function addReply(annotationId) {
  const reply = prompt('Reply:');
  if (!reply) return;

  const ann = annotations.find(a => a.id === annotationId);
  if (!ann) return;

  ann.replies.push(reply);
  renderAnnotations();
}

function exportAllComments() {
  if (!annotations.length) return;

  const lines = annotations.map((a, index) => {
    const header = `#${index + 1} (Page ${a.pageNumber})`;
    const textBlock = `Text: ${a.text}`;
    const replies = Array.isArray(a.replies) ? a.replies : [];
    const repliesText = replies.length
      ? replies.map((r, i) => `  [Comment ${i + 1}] ${r}`).join('\n')
      : '';
    return `${header}\n${textBlock}${repliesText ? '\nComments:\n' + repliesText : ''}`;
  });

  const allText = lines.join('\n\n');
  copyToClipboard(allText);

  if (exportAllBtn) {
    const label = exportAllBtn.querySelector('span');
    if (label) {
      const original = label.textContent;
      label.textContent = 'Copied!';
      setTimeout(() => {
        label.textContent = original;
      }, 1500);
    }
  }
}
