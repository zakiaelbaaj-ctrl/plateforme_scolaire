/**
 * whiteboard.js
 * Tableau interactif collaboratif (prof ↔ élèves)
 * Niveau senior+++: modularité, robustesse, sécurité
 */

(() => {
  const canvas = document.getElementById('whiteboard');
  if (!canvas) {
    console.error('❌ whiteboard.js: Canvas introuvable');
    return;
  }

  const ctx = canvas.getContext('2d');
  const role = window.userRole || 'prof'; // "prof" ou "eleve", défini globalement
  const drawColor = role === 'prof' ? 'black' : 'red';

  // === Utilitaires ===
  function drawPoint(x, y, color = drawColor) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 2, 2);
  }

  function clearBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // === Dessin local ===
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

  // === Effacement local (prof uniquement) ===
  const clearBtn = document.getElementById('clearBoardBtn');
  if (clearBtn && role === 'prof') {
    clearBtn.addEventListener('click', () => {
      clearBoard();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'whiteboardClear',
          role
        }));
      }
    });
  }

  // === Réception des événements WebSocket ===
  if (ws) {
    ws.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        console.warn('⚠️ whiteboard.js: Message non JSON', event.data);
        return;
      }

      switch (data.type) {
        case 'whiteboard':
          // couleur selon rôle expéditeur
          if (data.role === 'prof') {
            drawPoint(data.x, data.y, 'black');
          } else {
            drawPoint(data.x, data.y, 'blue'); // élèves visibles en bleu côté prof
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
    console.warn('⚠️ whiteboard.js: WebSocket non initialisé');
  }

  // === Résilience ===
  window.addEventListener('resize', () => {
    // garder proportions du tableau
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.putImageData(imgData, 0, 0);
  });

  console.log(`✅ whiteboard.js initialisé pour rôle: ${role}`);
})();
