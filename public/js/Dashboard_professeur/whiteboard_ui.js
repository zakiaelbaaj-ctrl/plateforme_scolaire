import { WhiteboardCore } from "/js/modules/whiteboard/whiteboard.core.js";
import { WhiteboardSocket } from "/js/modules/whiteboard/whiteboard.socket.js";
import { setTool, setColor, setSize } from "/js/modules/whiteboard/whiteboard.tools.js";
import { initWhiteboard as initHandlers } from "/js/modules/whiteboard/whiteboard.handlers.js";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("initWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardCore.init("whiteboard-canvas");
    WhiteboardSocket.init(ws, currentRoomId, "prof");
  });

  document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardCore.clear();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "whiteboard:clear", roomId: currentRoomId }));
    }
  });

  document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardCore.download();
  });
});
