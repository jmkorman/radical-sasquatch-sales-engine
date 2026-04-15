export function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  return (
    <div
      className={`${s} border-2 border-rs-gold/30 border-t-rs-gold rounded-full animate-spin`}
    />
  );
}
