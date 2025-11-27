# TODO: Fix JS Module Issues in InspiraDraw

## Pending Tasks
- [x] Edit public/landing.js: Remove exports, make handleLandingForm and bindRoomGenerator global (window.handleLandingForm, window.bindRoomGenerator).
- [x] Edit public/room.js: Remove exports, make initRoom, addChatMessage, sendMessage, updateUserList, generateRoomId, shareRoom, joinRoom, getSocket, getRoomId global.
- [ ] Edit public/drawing.js: Remove import { addChatMessage } from './room.js';, remove exports, make setMode, setColor, addStickyNote, exportCanvas, clearCanvas global.
- [ ] Update public/inspiradraw-landing.html: Add script to call handleLandingForm and bindRoomGenerator after DOM load.
- [ ] Update public/inspirashare-app.html: Change script src from "frontend.js" to "room.js" and "drawing.js", add script to call initRoom after DOM load.
- [ ] Test: Run server, open browser to localhost:8000, check console for errors, test landing form, room creation/joining, drawing, chat, sticky notes, export/clear.
- [ ] Debug: If issues, check network, console logs, fix any remaining problems.
