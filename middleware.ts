import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role as string | undefined;

    // ADMIN-only routes — redirect SALE_ADMIN to /overview
    const adminOnlyRoutes = ["/system-users", "/settings"];
    const isAdminOnly = adminOnlyRoutes.some((route) =>
      pathname.startsWith(route)
    );

    if (isAdminOnly && role !== "ADMIN") {
      const url = req.nextUrl.clone();
      url.pathname = "/overview";
      url.searchParams.set("warn", "no_permission");
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/overview/:path*",
    "/rfq/:path*",
    "/clients/:path*",
    "/system-users/:path*",
    "/settings/:path*",
  ],
};
