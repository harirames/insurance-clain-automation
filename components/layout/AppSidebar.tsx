"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  FlaskConical,
  Shield,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

interface Props {
  userRole: string;
  userName?: string | null;
  memberId?: string | null;
}

export function AppSidebar({ userRole, userName, memberId }: Props) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* Brand */}
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              isActive={false}
              render={
                <Link href="/" id="nav-brand">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold tracking-tight">
                      Plum Claims
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      Health Insurance
                    </span>
                  </div>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main nav */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                {
                  title: "Dashboard",
                  href: "/",
                  icon: LayoutDashboard,
                  id: "nav-dashboard",
                },
                {
                  title: userRole == "OPS" ? "All Claims" : "My Claims",
                  href: "/claims",
                  icon: FileText,
                  id: "nav-claims",
                },
              ].map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    render={
                      <Link href={item.href} id={item.id}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* OPS-only */}
        {userRole === "OPS" && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Operations</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={isActive("/eval")}
                      tooltip="Eval Harness"
                      render={
                        <Link href="/eval" id="nav-eval">
                          <FlaskConical className="h-4 w-4" />
                          <span>Eval Harness</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarSeparator />

      {/* Footer */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase select-none">
                {(userName ?? memberId ?? "U").charAt(0)}
              </div>
              <div className="grid flex-1 text-left text-xs leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium text-foreground">
                  {userName ?? memberId ?? "User"}
                </span>
                <span className="truncate text-muted-foreground">
                  {userRole}
                </span>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              render={
                <Link href="/api/auth/signout" id="nav-signout">
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
