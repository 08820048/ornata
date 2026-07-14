export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/ornata-icon.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
    />
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[16px] font-semibold tracking-tight text-foreground">
        Ornata
      </span>
    </span>
  );
}
