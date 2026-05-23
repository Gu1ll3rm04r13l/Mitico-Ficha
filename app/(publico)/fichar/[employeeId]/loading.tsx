// Feedback instantáneo al entrar a fichar un empleado: se pinta apenas se navega
// mientras el server resuelve los datos. Evita la sensación de "click muerto".
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-20">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted/30 border-t-accent" />
      <p className="mt-4 text-muted">Cargando…</p>
    </main>
  );
}
