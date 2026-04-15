export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_50px_rgba(9,4,26,0.35)] backdrop-blur ${className}`}>
      {children}
    </div>
  );
}
