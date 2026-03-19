/**
 * whiteboard.js (côté élève)
 * Tableau interactif collaboratif
 * - L'élève peut dessiner en rouge
 * - Reçoit les traits du prof (noir) et des autres élèves (bleu)
 * - Effacement synchronisé
 */

(() => {
  const canvas = document.getElementById('whiteboard');
  if (!canvas) {
    console.error('❌ whiteboard.js (élève): Canvas introuvable');
    return;
  }

  const ctx = canvas.getContext('2d');
  const role = 'eleve'; // rôle fixé côté élève
  const drawColor = 'red'; // couleur locale élève

  // === Utilitaires ===
  function drawPoint(x, y, color = drawColor) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 2, 2);
  }

  function clearBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // === Dessin local (élève) ===
  canvas.addEventListener('mousemove', (e) => {
    if (e.buttons !== 1) return; // dessiner seulement si clic gauche
    drawPoint(e.offsetX, e.offsetY);

    // envoyer aux autres via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'whiteboard',
        role,
        x: e.offsetX,
        y: e.offsetY
      }));
    }
  });

  // === Réception des événements WebSocket ===
  if (ws) {
    ws.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        console.warn('⚠️ whiteboard.js (élève): Message non JSON', event.data);
        return;
      }

      switch (data.type) {
        case 'whiteboard':
          if (data.role === 'prof') {
            drawPoint(data.x, data.y, 'black'); // traits du prof en noir
          } else if (data.role === 'eleve') {
            drawPoint(data.x, data.y, 'blue'); // autres élèves en bleu
          }
          break;

        case 'whiteboardClear':
          clearBoard();
          break;

        default:
          // ignorer les autres types
          break;
      }
    });
  } else {
    console.warn('⚠️ whiteboard.js (élève): WebSocket non initialisé');
  }

  // === Résilience ===
  window.addEventListener('resize', () => {
    // garder proportions du tableau
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.putImageData(imgData, 0, 0);
  });

  console.log('✅ whiteboard.js initialisé côté élève');
})();
