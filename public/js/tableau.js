/* ============================================================
   TABLEAU COLLABORATIF
============================================================ */
const canvas = new fabric.Canvas("tableauCanvas", {
  isDrawingMode: true,
});

canvas.freeDrawingBrush.width = 3;
canvas.freeDrawingBrush.color = "#2563eb";

// Synchronisation simple avec Socket.IO
canvas.on("path:created", function(e) {
  const json = e.path.toObject();
  socket.emit("canvasUpdate", { room: "global", path: json });
});

socket.on("canvasUpdate", (data) => {
  const path = new fabric.Path(data.path.path);
  path.set(data.path);
  canvas.add(path);
});
