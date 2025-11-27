// drawing.js - FIXED VERSION
// Handles: canvas setup, drawing, text editing, sticky notes, export/clear.
// Listens for: room:ready, draw:remote-*, sticky:remote-added
// Emits: draw-start/move/end, add-sticky-note

const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');
const textEditor = document.getElementById('textEditor');

let isDrawing = false;
let mode = 'draw';
let currentColor = '#786565ff';
let texts = [];
let selectedTextIndex = -1;
let isDraggingText = false;
let startX = 0, startY = 0;
let lastX = 0, lastY = 0;
let stickyCounter = 0;
let offsetX = 0, offsetY = 0;

// Store drawing data to prevent loss when redrawing
let drawingImageData = null;

// Provided by room.js once ready
let socket = null;
let ROOM_ID = null;

// Ensure canvas size and offsets
function resizeCanvas() {
  // Save current canvas content
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  
  // Restore content
  ctx.putImageData(imageData, 0, 0);
  
  const rect = canvas.getBoundingClientRect();
  offsetX = rect.left;
  offsetY = rect.top;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('scroll', () => {
  const rect = canvas.getBoundingClientRect();
  offsetX = rect.left;
  offsetY = rect.top;
});

// Mode switching
function setMode(newMode) {
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
function setColor(color) {
  currentColor = color;
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
  const match = Array.from(document.querySelectorAll('.color-option')).find(el => {
    const bg = el.style.backgroundColor;
    return bg && bg.includes(color.replace('#', '').substring(0, 6));
  });
  match?.classList.add('active');
}

// Save/restore drawing layer
function saveDrawingLayer() {
  drawingImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreDrawingLayer() {
  if (drawingImageData) {
    ctx.putImageData(drawingImageData, 0, 0);
  }
}

// Text rendering helpers
function redrawCanvas() {
  // Restore drawing layer
  if (drawingImageData) {
    ctx.putImageData(drawingImageData, 0, 0);
  }
  
  // Draw all text on top
  ctx.font = '16px Verdana';
  ctx.textBaseline = 'top';
  texts.forEach((t, i) => {
    ctx.fillStyle = t.color || '#000';
    ctx.fillText(t.text, t.x, t.y);
    
    // Highlight selected text
    if (i === selectedTextIndex && !textEditor.style.display.includes('block')) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - 2, t.y - 2, t.width + 4, t.height + 4);
    }
  });
}

function isTextHit(x, y, textObj) {
  return x >= textObj.x && x <= textObj.x + textObj.width && 
         y >= textObj.y && y <= textObj.y + textObj.height;
}

function addTextBox(text, x, y, color = '#000') {
  saveDrawingLayer();
  ctx.font = '16px Verdana';
  const width = ctx.measureText(text).width;
  const height = 20;
  texts.push({ text, x, y, width, height, color });
  redrawCanvas();
}

// Unified mouse event handler for canvas
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  if (mode === 'draw') {
    // Start drawing
    isDrawing = true;
    lastX = mouseX;
    lastY = mouseY;
    
    if (socket && ROOM_ID) {
      socket.emit('draw-start', ROOM_ID, lastX, lastY, currentColor);
    }
  } else if (mode === 'text') {
    // Check if clicking on existing text
    let hitText = false;
    for (let i = texts.length - 1; i >= 0; i--) {
      if (isTextHit(mouseX, mouseY, texts[i])) {
        selectedTextIndex = i;
        isDraggingText = true;
        startX = mouseX;
        startY = mouseY;
        hitText = true;
        saveDrawingLayer();
        break;
      }
    }
    
    // If not hitting text, create new text input
    if (!hitText) {
      selectedTextIndex = -1;
      createTextInput(mouseX, mouseY);
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  if (isDrawing && mode === 'draw') {
    // Draw on canvas
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(mouseX, mouseY);
    ctx.stroke();
    
    lastX = mouseX;
    lastY = mouseY;
    
    if (socket && ROOM_ID) {
      socket.emit('draw-move', ROOM_ID, lastX, lastY);
    }
  } else if (isDraggingText && selectedTextIndex >= 0) {
    // Drag text
    const dx = mouseX - startX;
    const dy = mouseY - startY;
    startX = mouseX;
    startY = mouseY;
    
    const t = texts[selectedTextIndex];
    t.x += dx;
    t.y += dy;
    
    // Redraw everything
    redrawCanvas();
  }
});

canvas.addEventListener('mouseup', () => {
  if (isDrawing) {
    // Save the drawing layer after drawing
    saveDrawingLayer();
    
    if (socket && ROOM_ID) {
      socket.emit('draw-end', ROOM_ID);
    }
    isDrawing = false;
  }
  
  if (isDraggingText) {
    isDraggingText = false;
    selectedTextIndex = -1;
    saveDrawingLayer();
  }
});

canvas.addEventListener('mouseleave', () => {
  if (isDrawing && socket && ROOM_ID) {
    socket.emit('draw-end', ROOM_ID);
  }
  isDrawing = false;
  isDraggingText = false;
});

// Double-click to edit text
canvas.addEventListener('dblclick', (e) => {
  if (mode !== 'text') return;
  
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (isTextHit(mouseX, mouseY, t)) {
      selectedTextIndex = i;
      textEditor.style.left = `${e.clientX}px`;
      textEditor.style.top = `${e.clientY}px`;
      textEditor.style.width = `${Math.max(t.width + 20, 150)}px`;
      textEditor.style.height = `${t.height + 20}px`;
      textEditor.value = t.text;
      textEditor.style.display = 'block';
      textEditor.focus();
      return;
    }
  }
});

// Edit text
textEditor.addEventListener('blur', () => {
  if (selectedTextIndex >= 0 && selectedTextIndex < texts.length) {
    const t = texts[selectedTextIndex];
    t.text = textEditor.value;
    ctx.font = '16px Verdana';
    t.width = ctx.measureText(t.text).width;
    redrawCanvas();
  }
  textEditor.style.display = 'none';
  selectedTextIndex = -1;
});

textEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    textEditor.style.display = 'none';
    selectedTextIndex = -1;
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    textEditor.blur();
  }
});

// Text input overlay for free typing
function createTextInput(x, y) {
  const textBox = document.createElement('textarea');
  textBox.className = 'text-input-box';
  textBox.style.position = 'absolute';
  textBox.style.left = (x + offsetX) + 'px';
  textBox.style.top = (y + offsetY) + 'px';
  textBox.style.resize = 'none';
  textBox.style.zIndex = '1000';
  textBox.style.border = '2px solid ' + currentColor;
  textBox.style.background = 'rgba(255, 255, 255, 0.95)';
  textBox.style.padding = '5px';
  textBox.style.fontFamily = 'Verdana';
  textBox.style.fontSize = '14px';
  textBox.placeholder = 'Type here...';
  textBox.rows = 1;
  textBox.cols = 20;

  document.body.appendChild(textBox);
  textBox.focus();

  let dragging = false;
  let dragStartX = 0, dragStartY = 0;

  textBox.addEventListener('mousedown', (e) => {
    if (e.target === textBox) {
      dragging = true;
      dragStartX = e.clientX - parseInt(textBox.style.left, 10);
      dragStartY = e.clientY - parseInt(textBox.style.top, 10);
      textBox.style.cursor = 'grabbing';
      e.stopPropagation();
    }
  });

  const moveHandler = (e) => {
    if (!dragging) return;
    textBox.style.left = (e.clientX - dragStartX) + 'px';
    textBox.style.top = (e.clientY - dragStartY) + 'px';
    e.preventDefault();
  };

  const upHandler = () => {
    dragging = false;
    textBox.style.cursor = 'text';
  };

  document.addEventListener('mousemove', moveHandler);
  document.addEventListener('mouseup', upHandler);

  const commitText = () => {
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
    
    if (textBox.value.trim()) {
      const rect = canvas.getBoundingClientRect();
      const finalX = parseInt(textBox.style.left, 10) - rect.left;
      const finalY = parseInt(textBox.style.top, 10) - rect.top;
      
      addTextBox(textBox.value, finalX, finalY, currentColor);
    }
    textBox.remove();
  };

  textBox.addEventListener('blur', commitText);
  
  textBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textBox.remove();
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
  });
}

// Sticky notes
function addStickyNote() {
  stickyCounter++;
  const sticky = document.createElement('div');
  sticky.className = 'sticky-note';
  sticky.contentEditable = true;
  sticky.innerHTML = `<div class="sticky-close" onclick="this.parentElement.remove()">×</div>NOTE #${stickyCounter}<br><br>Click to edit...`;

  const rect = container.getBoundingClientRect();
  const randomX = Math.random() * Math.max(100, rect.width - 220);
  const randomY = Math.random() * Math.max(100, rect.height - 220);
  
  sticky.style.left = randomX + 'px';
  sticky.style.top = randomY + 'px';
  sticky.style.position = 'absolute';
  sticky.style.zIndex = '100';
  
  container.appendChild(sticky);

  let dragging = false;
  let dragX = 0, dragY = 0;

  sticky.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('sticky-close')) return;
    if (sticky.isContentEditable && window.getSelection().toString()) return;
    
    dragging = true;
    dragX = e.clientX - parseInt(sticky.style.left, 10);
    dragY = e.clientY - parseInt(sticky.style.top, 10);
    sticky.style.cursor = 'grabbing';
    e.preventDefault();
  });

  const moveHandler = (e) => {
    if (!dragging) return;
    sticky.style.left = (e.clientX - dragX) + 'px';
    sticky.style.top = (e.clientY - dragY) + 'px';
  };

  const upHandler = () => {
    dragging = false;
    sticky.style.cursor = 'move';
  };

  document.addEventListener('mousemove', moveHandler);
  document.addEventListener('mouseup', upHandler);

  // Sync to others
  if (socket && ROOM_ID) {
    const note = {
      text: `NOTE #${stickyCounter}`,
      x: randomX,
      y: randomY,
      color: '#ffff88',
    };
    socket.emit('add-sticky-note', ROOM_ID, note);
  }
}

// Export / Clear
function exportCanvas() {
  const link = document.createElement('a');
  link.download = `inspirashare-canvas-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function clearCanvas() {
  if (confirm('Clear entire canvas? This cannot be undone!')) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    texts = [];
    drawingImageData = null;
    document.querySelectorAll('.sticky-note').forEach(note => note.remove());
    document.querySelectorAll('.text-input-box').forEach(box => box.remove());
  }
}

// Remote draw listeners
window.addEventListener('draw:remote-start', (e) => {
  const { x, y, color } = e.detail;
  ctx.strokeStyle = color || '#5eb3d6';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
});

window.addEventListener('draw:remote-move', (e) => {
  const { x, y } = e.detail;
  ctx.lineTo(x, y);
  ctx.stroke();
});

window.addEventListener('draw:remote-end', () => {
  // Save remote drawing
  saveDrawingLayer();
});

// Sticky notes from others
window.addEventListener('sticky:remote-added', (e) => {
  const note = e.detail;
  const sticky = document.createElement('div');
  sticky.className = 'sticky-note';
  sticky.contentEditable = false;
  sticky.innerHTML = `<div class="sticky-close" onclick="this.parentElement.remove()">×</div>${note.text || 'Remote NOTE'}<br>`;
  sticky.style.left = note.x + 'px';
  sticky.style.top = note.y + 'px';
  sticky.style.position = 'absolute';
  sticky.style.zIndex = '100';
  sticky.style.background = note.color || '#ffff88';
  container.appendChild(sticky);
});

// Bind UI controls
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('drawBtn')?.addEventListener('click', () => setMode('draw'));
  document.getElementById('textBtn')?.addEventListener('click', () => setMode('text'));

  document.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', (ev) => {
      const color = window.getComputedStyle(ev.target).backgroundColor;
      // Convert rgb to hex if needed
      setColor(color);
    });
  });

  document.getElementById('exportBtn')?.addEventListener('click', exportCanvas);
  document.getElementById('clearBtn')?.addEventListener('click', clearCanvas);
  document.getElementById('stickyBtn')?.addEventListener('click', addStickyNote);
  
  // Initialize with draw mode
  setMode('draw');
});

// Export functions
window.setMode = setMode;
window.setColor = setColor;
window.addStickyNote = addStickyNote;
window.exportCanvas = exportCanvas;
window.clearCanvas = clearCanvas;

// Receive socket and roomId when ready
window.addEventListener('room:ready', (e) => {
  socket = e.detail.socket;
  ROOM_ID = e.detail.roomId;
  if (window.addChatMessage) {
    window.addChatMessage('System', `Drawing ready in room ${ROOM_ID}`);
  }
  // Initialize canvas
  saveDrawingLayer();
});