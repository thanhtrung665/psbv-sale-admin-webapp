import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export default async function Sidebar() {
  const session = await getServerSession(authOptions);
  const userRole = (session?.user as any)?.role || "SALE_ADMIN";

  return (
    <div className="w-64 h-full bg-slate-800 text-white flex flex-col">
      <div className="p-4 font-bold text-xl border-b border-slate-700">
        PSBV Sales SaaS
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <Link href="/overview" className="block py-2 px-4 rounded hover:bg-slate-700">Overview</Link>
        <Link href="/rfq" className="block py-2 px-4 rounded hover:bg-slate-700">RFQ Management</Link>
        <Link href="/rfq/new" className="block py-2 px-4 rounded hover:bg-slate-700">New RFQ</Link>
        
        {/* ADMIN EXCLUSIVE */}
        {userRole === "ADMIN" && (
          <>
            <div className="pt-4 mt-4 border-t border-slate-700 text-xs text-gray-400 uppercase font-semibold">Admin</div>
            <Link href="/system-users" className="block py-2 px-4 rounded hover:bg-slate-700">System Users</Link>
            <Link href="/settings" className="block py-2 px-4 rounded hover:bg-slate-700">Settings</Link>
          </>
        )}
      </nav>
    </div>
  );
}
