import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries";
import DashboardOverview from "@/components/DashboardOverview";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const uid = currentUserId();
  if (!uid) redirect("/login");

  const stats = await getDashboardStats();

  return <DashboardOverview stats={stats} />;
}
