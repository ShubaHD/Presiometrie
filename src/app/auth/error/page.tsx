import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="bg-background flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Autentificare eșuată</h1>
      <p className="text-muted-foreground max-w-md text-center text-sm">
        Nu s-a putut finaliza sesiunea. Verificați linkul sau încercați din nou autentificarea.
      </p>
      <Link href="/login" className="text-primary text-sm underline">
        Înapoi la autentificare
      </Link>
    </div>
  );
}
