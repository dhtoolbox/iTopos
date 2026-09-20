export function initializePanel({ element, title, iconSrc = null, defaultOpen = false }) {
  if (!element) return createEmptyController();

  const content = document.createElement("div");
  content.className = "ui-panel__content";
  while (element.firstChild) content.append(element.firstChild);

  const header = document.createElement("div");
  header.className = "ui-panel__header";

  const heading = document.createElement("h2");
  heading.className = "ui-panel__title";

  if (iconSrc) {
    const icon = document.createElement("img");
    icon.className = "ui-panel__icon";
    icon.src = iconSrc;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    heading.append(icon);
  }

  const headingText = document.createElement("span");
  headingText.textContent = title;
  heading.append(headingText);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ui-panel__toggle";
  toggle.setAttribute("aria-label", `Toggle ${title}`);

  header.append(heading, toggle);
  element.classList.add("ui-panel");
  element.replaceChildren(header, content);

  let isOpen = defaultOpen;

  function update() {
    content.hidden = !isOpen;
    toggle.textContent = isOpen ? "−" : "+";
    toggle.setAttribute("aria-expanded", String(isOpen));
    element.classList.toggle("is-open", isOpen);
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    isOpen = !isOpen;
    update();
  });

  header.addEventListener("click", () => {
    isOpen = !isOpen;
    update();
  });

  update();

  return {
    open() { isOpen = true; update(); },
    close() { isOpen = false; update(); },
    toggle() { isOpen = !isOpen; update(); },
    isOpen() { return isOpen; },
    destroy() {
      element.classList.remove("ui-panel", "is-open");
      element.innerHTML = "";
    },
  };
}

function createEmptyController() {
  return { open() {}, close() {}, toggle() {}, isOpen() { return false; }, destroy() {} };
}
