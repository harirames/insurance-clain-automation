import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  crumbs: Crumb[];
  badge?: string;
}

export function AppHeader({ crumbs, badge }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 backdrop-blur-sm px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-muted-foreground/50 select-none">/</span>
            )}
            {crumb.href && i < crumbs.length - 1 ? (
              <a
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </a>
            ) : (
              <span
                className={
                  i === crumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {badge && (
        <Badge variant="secondary" className="ml-2 text-xs">
          {badge}
        </Badge>
      )}
    </header>
  );
}
