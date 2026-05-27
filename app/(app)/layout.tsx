import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;

  return (
    <SidebarProvider>
      <AppSidebar
        userRole={user.role}
        userName={user.name}
        memberId={user.memberId}
      />
      <SidebarInset className="flex flex-col min-h-screen overflow-x-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
