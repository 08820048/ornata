import Image from "next/image";

export function LogoMark({
  size = 28,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/ornata-mark-2026.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
      aria-hidden="true"
      className="shrink-0"
    />
  );
}

export function Wordmark({
  size = 24,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} priority={priority} />
      <span className="text-[16px] font-medium tracking-[-0.02em] text-foreground">
        Ornata
      </span>
    </span>
  );
}
