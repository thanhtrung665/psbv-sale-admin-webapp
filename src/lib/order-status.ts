/**
 * Client-safe mirror of the `OrderStatus` enum (prisma/schema.prisma). `src/lib/schemas/common.schemas.ts`
 * derives its Zod schema straight from `@prisma/client`'s generated enum instead, but that package can't be
 * imported from client components (it pulls in Node-only code and breaks the browser bundle) — this plain,
 * dependency-free array is the shared source for the few places that need the list of values client-side.
 */
export const ORDER_STATUSES = [
  "INQUIRY_RECEIVED",
  "RFO_PENDING_ADMIN",
  "RFO_SENT_TO_SUPPLIER",
  "SUPPLIER_QUOTED",
  "CBU_PENDING_ADMIN",
  "QUOTATION_DRAFTED",
  "QUOTED_TO_CLIENT",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];
