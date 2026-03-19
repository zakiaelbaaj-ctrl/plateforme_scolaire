export function addDocument(doc) {
  if (!doc || !doc.id || !doc.name) {
    console.error("[document.view] Document invalide :", doc);
    return;
  }

  const container = document.getElementById("doc-list");
  if (!container) {
    console.error("[document.view] #doc-list introuvable dans le DOM");
    return;
  }

  const item = document.createElement("li");
  item.classList.add("document-item");
  item.dataset.id = doc.id;

  const nameDiv = document.createElement("div");
  nameDiv.className = "document-name";
  nameDiv.textContent = doc.name;

  const btn = document.createElement("button");
  btn.className = "document-link";
  btn.textContent = "Télécharger";
  btn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = doc.fileData ?? doc.url;
    link.download = doc.name;
    link.click();
  });

  item.appendChild(nameDiv);
  item.appendChild(btn);
  container.appendChild(item);
}