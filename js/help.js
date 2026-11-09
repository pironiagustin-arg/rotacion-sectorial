// "?" en la esquina de cada tarjeta con data-help: explica cómo leer el indicador.
export function mountHelp(HELP) {
  const add = (sec) => {
    if (sec.querySelector(":scope > .hq-c") || !HELP[sec.dataset.help]) return;
    if (getComputedStyle(sec).position === "static") sec.style.position = "relative";
    const b = document.createElement("button"); b.className = "hq-c"; b.textContent = "?"; b.setAttribute("aria-label", "Cómo leer esto");
    b.onclick = (e) => {
      e.stopPropagation();
      const open = sec.querySelector(":scope > .hq-pop");
      document.querySelectorAll(".hq-pop").forEach((p) => p.remove()); document.querySelectorAll(".hq-c.on").forEach((x) => x.classList.remove("on"));
      if (open) return;
      const p = document.createElement("div"); p.className = "hq-pop"; p.innerHTML = HELP[sec.dataset.help]; p.onclick = (ev) => ev.stopPropagation();
      sec.appendChild(p); b.classList.add("on");
    };
    sec.appendChild(b);
  };
  const scan = () => document.querySelectorAll("[data-help]").forEach(add);
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", () => { document.querySelectorAll(".hq-pop").forEach((p) => p.remove()); document.querySelectorAll(".hq-c.on").forEach((x) => x.classList.remove("on")); });
}
