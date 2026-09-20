export function initializeDrawer({ onTabChange, initialMinimized = false } = {}) {
  const drawer = document.getElementById("tool-drawer");
  const tabs = [...document.querySelectorAll(".tool-drawer__tab")];
  const panes = [...document.querySelectorAll(".tool-drawer__pane")];
  const minimize = document.getElementById("tool-drawer-minimize");
  const layout = drawer?.closest(".layout");

  if (!drawer || tabs.length === 0 || panes.length === 0) return;

  let activeTab = tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset
    .drawerTab;
  activeTab ||= tabs[0].dataset.drawerTab;

  function setMinimized(minimized) {
    drawer.classList.toggle("is-minimized", minimized);
    layout?.classList.toggle("drawer-is-minimized", minimized);

    if (minimize) {
      const icon = document.createElement("img");
      icon.src = minimized
        ? "./static/vendor/icons/angles-right.svg"
        : "./static/vendor/icons/angles-left.svg";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      icon.className = "control-icon";

      minimize.innerHTML = icon.outerHTML;
      minimize.setAttribute("aria-expanded", String(!minimized));
      minimize.setAttribute(
        "aria-label",
        minimized ? "Expand tool drawer" : "Minimize tool drawer",
      );
      minimize.title = minimized ? "Expand tools" : "Minimize tools";
    }
  }

  function selectTab(name) {
    activeTab = name;
    drawer.dataset.activeTab = name;
    setMinimized(false);

    for (const tab of tabs) {
      const selected = tab.dataset.drawerTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }

    for (const pane of panes) {
      pane.hidden = pane.dataset.drawerPane !== name;
    }

    onTabChange?.(name);
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const name = tab.dataset.drawerTab;
      if (drawer.classList.contains("is-minimized") || name !== activeTab) {
        selectTab(name);
      }
    });
  }

  minimize?.addEventListener("click", () => {
    setMinimized(!drawer.classList.contains("is-minimized"));
  });

  if (initialMinimized) {
    for (const tab of tabs) {
      const selected = tab.dataset.drawerTab === activeTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const pane of panes) pane.hidden = pane.dataset.drawerPane !== activeTab;
    drawer.dataset.activeTab = activeTab;
    setMinimized(true);
  } else {
    selectTab(activeTab);
  }

  return {
    selectTab,
    minimize() {
      setMinimized(true);
    },
    expand() {
      setMinimized(false);
    },
  };
}
