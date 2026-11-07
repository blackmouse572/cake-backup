/** The Doorway mark (assets/brand/cage-symbol.svg). */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} role="img" aria-label="Cage">
      <path fill="#111111" d="M48 232V128A80 80 0 0 1 208 128V232H176V128A48 48 0 0 0 80 128V232Z" />
      <circle cx="128" cy="150" r="22" fill="#0090FF" />
      <path fill="#0090FF" d="M98 232V210A30 30 0 0 1 158 210V232Z" />
    </svg>
  );
}
