import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { BreadcrumbItem as Crumb } from "@/types/lab";
import Link from "next/link";

export function LabBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList>
        {items.map((it, i) => (
          <span key={`${it.label}-${i}`} className="contents">
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {it.href ? (
                <Link
                  href={it.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {it.label}
                </Link>
              ) : (
                <BreadcrumbPage>{it.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
