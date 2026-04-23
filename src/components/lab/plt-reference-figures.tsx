import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CAPTION =
  "Fig. 3 ASTM D5731 — D, W, L și probă echivalentă (diametral, axial, bloc, neregulat)";

export function PltReferenceFigures() {
  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cum măsurăm (ASTM D5731-16)</CardTitle>
        <CardDescription>
          Notarea <strong>D</strong>, <strong>W</strong>, <strong>L</strong> pentru fiecare tip de probă. Aceeași
          figură poate fi inclusă în PDF (tab Raport).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <figure className="mx-auto max-w-xl overflow-hidden rounded-md border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element -- static public ref */}
          <img
            src="/references/plt/astm-d5731-fig3-geometries.png"
            alt={CAPTION}
            className="bg-background mx-auto block max-h-[min(42vh,320px)] w-full object-contain"
            loading="lazy"
          />
          <figcaption className="text-muted-foreground border-t px-2 py-1.5 text-xs leading-snug">
            {CAPTION}
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
