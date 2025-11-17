// drawing.js
// Handles: canvas setup, drawing, text editing, sticky notes, export/clear.
// Listens for: room:ready, draw:remote-*, sticky:remote-added
// Emits: draw-start/move/end, add-sticky-note

import { addChatMessage } from './room.js';

const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');
const textEditor = document.getElementById('textEditor');

let isDrawing = false;
let mode = 'draw';
let currentColor = '#786565ff';
let texts = [];
let selectedTextIndex = -1;
let startX = 0, startY = 0;
let lastX = 0, lastY = 0;
let stickyCounter = 0;
let offsetX = 0, offsetY = 0;

// Provided by room.js once ready
let socket = null;
let ROOM_ID = null;

// Ensure canvas size and offsets
function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  const rect = canvas.getBoundingClientRect();
  offsetX = rect.left;
  offsetY = rect.top;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('scroll', resizeCanvas);

// Mode switching
export function setMode(newMode) {
  mode = newMode;
  const drawBtn = document.getElementById('drawBtn');
  const textBtn = document.getElementById('textBtn');
  const indicator = document.getElementById('modeIndicator');
  if (drawBtn && textBtn) {
    drawBtn.classList.remove('active');
    textBtn.classList.remove('active');
  }
  if (newMode === 'draw') {
    drawBtn?.classList.add('active');
    if (indicator) indicator.textContent = 'MODE: DRAW';
    canvas.style.cursor = 'crosshair';
  } else if (newMode === 'text') {
    textBtn?.classList.add('active');
    if (indicator) indicator.textContent = 'MODE: TEXT';
    canvas.style.cursor = 'text';
  }
}

// Color selection
export function setColor(color) {
  currentColor = color;
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
  const match = Array.from(document.querySelectorAll('.color-option')).find(el => el.style.background.includes(color));
  match?.classList.add('active');
}

// Text rendering helpers
function drawTexts() {
  // Only clear text layer; if you want full-layer compositing, render text on separate canvas
  ctx.font = '16px Verdana';
  ctx.textBaseline = 'top';
  texts.forEach((t, i) => {
    ctx.fillStyle = t.color || '#000';
    ctx.fillText(t.text, t.x, t.y);
    if (i === selectedTextIndex) {
      ctx.strokeStyle = 'red';
      ctx.strokeRect(t.x - 2, t.y - 2, t.width + 4, t.height + 4);
    }
  });
}

function isTextHit(x, y, textObj) {
  return x >= textObj.x && x <= textObj.x + textObj.width && y >= textObj.y && y <= textObj.y + textObj.height;
}

function addTextBox(text, x, y, color = '#000') {
  ctx.font = '16px Verdana';
  const width = ctx.measureText(text).width;
  const height = 20;
  texts.push({ text, x, y, width, height, color });
  drawTexts();
}

// Canvas text interactions
canvas.addEventListener('click', (e) => {
  if (mode !== 'text') return;
  const mouseX = e.clientX - offsetX;
  const mouseY = e.clientY - offsetY;
  addTextBox('Hello', mouseX, mouseY, currentColor);
});

canvas.addEventListener('mousedown', (e) => {
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
  for (let i = texts.length - 1; i >= 0; i--) {
    if (isTextHit(startX, startY, texts[i])) {
      selectedTextIndex = i;
      break;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (selectedTextIndex < 0) return;
  const mouseX = e.clientX - offsetX;
  const mouseY = e.clientY - offsetY;
  const dx = mouseX - startX;
  const dy = mouseY - startY;
  startX = mouseX;
  startY = mouseY;
  const t = texts[selectedTextIndex];
  t.x += dx;
  t.y += dy;
  // Redraw text bounding box without clearing strokes
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTexts();
});

canvas.addEventListener('mouseup', () => {
  selectedTextIndex = -1;
});
canvas.addEventListener('mouseout', () => {
  selectedTextIndex = -1;
});

canvas.addEventListener('dblclick', (e) => {
  const mouseX = e.clientX - offsetX;
  const mouseY = e.clientY - offsetY;
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (isTextHit(mouseX, mouseY, t)) {
      selectedTextIndex = i;
      textEditor.style.left = `${t.x + offsetX}px`;
      textEditor.style.top = `${t.y + offsetY}px`;
      textEditor.style.width = `${t.width + 20}px`;
      textEditor.style.height = `${t.height + 10}px`;
      textEditor.value = t.text;
      textEditor.style.display = 'block';
      textEditor.focus();
      return;
    }
  }
});

// Edit text
textEditor.addEventListener('blur', () => {
  if (selectedTextIndex >= 0) {
    const t = texts[selectedTextIndex];
    t.text = textEditor.value;
    t.width = ctx.measureText(t.text).width;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTexts();
  }
  textEditor.style.display = 'none';
});
textEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    textEditor.style.display = 'none';
  }
});

// Drawing interactions
canvas.addEventListener('mousedown', (e) => {
  if (mode === 'draw') {
    isDrawing = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
    if (socket && ROOM_ID) {
      socket.emit('draw-start', ROOM_ID, lastX, lastY, currentColor);
    }
  } else if (mode === 'text') {
    createTextInput(e.offsetX, e.offsetY);
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || mode !== 'draw') return;
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
  lastX = e.offsetX;
  lastY = e.offsetY;
  if (socket && ROOM_ID) {
    socket.emit('draw-move', ROOM_ID, lastX, lastY);
  }
});

canvas.addEventListener('mouseup', () => {
  if (isDrawing && socket && ROOM_ID) {
    socket.emit('draw-end', ROOM_ID);
  }
  isDrawing = false;
});

canvas.addEventListener('mouseleave', () => {
  if (isDrawing && socket && ROOM_ID) {
    socket.emit('draw-end', ROOM_ID);
  }
  isDrawing = false;
});

// Mouse wheel quick-edit reveal
canvas.addEventListener('wheel', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (mouseX >= t.x && mouseX <= t.x + t.width && mouseY >= t.y && mouseY <= t.y + t.height) {
      selectedTextIndex = i;
      textEditor.style.left = `${t.x + rect.left}px`;
      textEditor.style.top = `${t.y + rect.top}px`;
      textEditor.style.width = `${t.width + 20}px`;
      textEditor.style.height = `${t.height + 10}px`;
      textEditor.value = t.text;
      textEditor.style.display = 'block';
      textEditor.focus();
      break;
    }
  }
});

// Text input overlay for free typing then commit to canvas
function createTextInput(x, y) {
  const textBox = document.createElement('textarea');
  textBox.className = 'text-input-box';
  textBox.style.position = 'absolute';
  textBox.style.left = x + 'px';
  textBox.style.top = y + 'px';
  textBox.style.resize = 'none';
  textBox.style.zIndex = 10;
  textBox.placeholder = 'Type here...';
  textBox.rows = 3;

  container.appendChild(textBox);
  textBox.focus();

  let dragging = false;
  let ox = 0, oy = 0;

  textBox.addEventListener('mousedown', (e) => {
    dragging = true;
    ox = e.clientX - textBox.offsetLeft;
    oy = e.clientY - textBox.offsetTop;
    textBox.style.cursor = 'grabbing';
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    textBox.style.left = (e.clientX - ox) + 'px';
    textBox.style.top = (e.clientY - oy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    textBox.style.cursor = 'move';
  });

  textBox.addEventListener('blur', () => {
    if (textBox.value.trim()) {
      const rect = canvas.getBoundingClientRect();
      const finalX = parseInt(textBox.style.left, 10) - rect.left;
      const finalY = parseInt(textBox.style.top, 10) - rect.top + 16;
      ctx.fillStyle = currentColor;
      ctx.font = '14px "Orbitron"';
      textBox.value.split('\n').forEach((line, i) => {
        ctx.fillText(line, finalX, finalY + (i * 22));
      });
    }
    textBox.remove();
  });

  textBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textBox.remove();
    }
  });
}

// Sticky notes (local + sync)
export function addStickyNote() {
  stickyCounter++;
  const sticky = document.createElement('div');
  sticky.className = 'sticky-note';
  sticky.contentEditable = true;
  sticky.innerHTML = `<div class="sticky-close" onclick="this.parentElement.remove()">×</div>NOTE #${stickyCounter}<br><br>Double-click to edit...`;

  sticky.style.left = (Math.random() * (container.clientWidth - 220)) + 'px';
  sticky.style.top = (Math.random() * (container.clientHeight - 220)) + 'px';
  container.appendChild(sticky);

  let dragging = false;
  let ox = 0, oy = 0;

  sticky.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('sticky-close')) return;
    dragging = true;
    ox = e.clientX - sticky.offsetLeft;
    oy = e.clientY - sticky.offsetTop;
    sticky.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    sticky.style.left = (e.clientX - ox) + 'px';
    sticky.style.top = (e.clientY - oy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    sticky.style.cursor = 'move';
  });

  // Sync to others
  if (socket && ROOM_ID) {
    const rect = container.getBoundingClientRect();
    const note = {
      text: sticky.textContent,
      x: parseInt(sticky.style.left, 10) - rect.left,
      y: parseInt(sticky.style.top, 10) - rect.top,
      color: '#ffff88',
    };
    socket.emit('add-sticky-note', ROOM_ID, note);
  }
}

// Export / Clear
export function exportCanvas() {
  const link = document.createElement('a');
  link.download = 'inspirashare-canvas.png';
  link.href = canvas.toDataURL();
  link.click();
}

export function clearCanvas() {
  if (confirm('Clear entire canvas? This cannot be undone!')) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.querySelectorAll('.sticky-note').forEach(note => note.remove());
    document.querySelectorAll('.text-input-box').forEach(box => box.remove());
  }
}

// Remote draw listeners (from room.js)
window.addEventListener('draw:remote-start', (e) => {
  const { x, y, color, userId } = e.detail;
  ctx.strokeStyle = color || '#5eb3d6';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
});

window.addEventListener('draw:remote-move', (e) => {
  const { x, y } = e.detail;
  ctx.lineTo(x, y);
  ctx.stroke();
});

window.addEventListener('draw:remote-end', () => {
  // No-op (path already stroked)
});

// Sticky notes from others
window.addEventListener('sticky:remote-added', (e) => {
  const note = e.detail;
  const sticky = document.createElement('div');
  sticky.className = 'sticky-note';
  sticky.contentEditable = false;
  sticky.innerHTML = `<div class="sticky-close" onclick="this.parentElement.remove()">×</div>${note.text || 'NOTE'}<br>`;
  const rect = container.getBoundingClientRect();
  sticky.style.left = (note.x + rect.left) + 'px';
  sticky.style.top = (note.y + rect.top) + 'px';
  container.appendChild(sticky);
});

// Bind UI controls to module functions
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('drawBtn')?.addEventListener('click', () => setMode('draw'));
  document.getElementById('textBtn')?.addEventListener('click', () => setMode('text'));

  document.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', (ev) => setColor(ev.target.style.backgroundColor));
  });

  document.getElementById('exportBtn')?.addEventListener('click', exportCanvas);
  document.getElementById('clearBtn')?.addEventListener('click', clearCanvas);
  document.getElementById('stickyBtn')?.addEventListener('click', addStickyNote);
});

// Receive socket and roomId when ready
window.addEventListener('room:ready', (e) => {
  socket = e.detail.socket;
  ROOM_ID = e.detail.roomId;
  addChatMessage('System', `Drawing module bound to room ${ROOM_ID}`);
});
