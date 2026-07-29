import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    // Assuming the JWT token contains the user's role
    const role = req.nextauth.token?.role;

    // 1. ADMIN exclusive routes
    if (pathname.startsWith("/system-users") || pathname.startsWith("/settings")) {
      if (role !== "ADMIN") {
        // Redirect SALE_ADMIN (or unauthorized) to overview instead of letting them see the page
        return NextResponse.redirect(new URL("/overview", req.url));
      }
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
    "/settings/:path*"
  ],
};
