// Marca de fichaje cargado fuera del momento (hora a mano).
// Tooltip propio (CSS) que aparece al instante en hover/focus — sin la demora
// de ~1.5s del atributo title nativo.

export function BadgeManual({ size = "sm" }: { size?: "sm" | "xs" }) {
  const pad = size === "xs" ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-xs";
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        aria-label="Fichaje fuera de horario"
        className={`inline-flex shrink-0 cursor-help items-center rounded-md bg-accent/20 text-accent outline-none ${pad}`}
      >
        ⏱
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-bg-card px-2 py-1 text-xs text-cream opacity-0 shadow-lg ring-1 ring-muted/30 transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        Fichaje fuera de horario
      </span>
    </span>
  );
}
