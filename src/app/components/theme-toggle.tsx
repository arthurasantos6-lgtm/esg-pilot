"use client";

/** Alterna entre modo claro e escuro; os ícones seguem `data-theme` pelo CSS. */
export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Sem acesso ao armazenamento, o tema vale só até recarregar a página.
    }
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label="Alternar entre modo claro e escuro" title="Alternar entre modo claro e escuro">
      <span className="theme-icon-dark" aria-hidden="true">☾</span>
      <span className="theme-icon-light" aria-hidden="true">☀</span>
    </button>
  );
}
