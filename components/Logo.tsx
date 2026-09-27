export function Logo({ small = false }: { small?: boolean }) {
  return (
    <h1
      className={`text-center font-black tracking-tight ${small ? 'text-2xl' : 'text-5xl'}`}
      aria-label="Alergia"
    >
      <span className="text-zinc-100">Aler</span>
      <span className="text-accent">gia</span>
    </h1>
  );
}
