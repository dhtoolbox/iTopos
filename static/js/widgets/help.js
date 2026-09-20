let helpDialog = null;
let helpTabs = [];
let helpPanels = [];

function selectTab(tab) {
  if (!tab) return;
  const panelId = tab.getAttribute("aria-controls");

  for (const candidate of helpTabs) {
    const selected = candidate === tab;
    candidate.classList.toggle("is-active", selected);
    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  }

  for (const panel of helpPanels) panel.hidden = panel.id !== panelId;
  if (helpDialog) helpDialog.scrollTop = 0;
}

export function openHelp(tabName = "upload") {
  if (!helpDialog) return;
  const tab = document.querySelector(`#help-tab-${tabName}`) ?? helpTabs[0];
  selectTab(tab);
  if (!helpDialog.open) helpDialog.showModal();
}

export function closeHelp() {
  if (helpDialog?.open) helpDialog.close();
}

export function initializeHelp() {
  const button = document.querySelector("#help-button");
  helpDialog = document.querySelector("#help-dialog");
  const closeButton = document.querySelector("#help-close");
  helpTabs = [...document.querySelectorAll(".help-tab")];
  helpPanels = [...document.querySelectorAll(".help-tab-panel")];

  if (!button || !helpDialog || !closeButton) return;

  for (const tab of helpTabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = helpTabs.indexOf(tab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = helpTabs[(index + offset + helpTabs.length) % helpTabs.length];
      selectTab(next);
      next.focus();
    });
  }

  button.addEventListener("click", () => openHelp("upload"));
  closeButton.addEventListener("click", () => helpDialog.close());
  helpDialog.addEventListener("click", (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });
}
