export function ProjectMark({
  mark,
  color,
}: {
  mark: string;
  color: string;
}) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[12px] font-medium tracking-[-0.02em] text-white"
      style={{ background: color }}
    >
      {mark}
    </span>
  );
}
