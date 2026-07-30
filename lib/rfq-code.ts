import { prisma } from "./prisma";

/**
 * Generates a unique RFQ/RFO code in the format: ACNNNN
 * Auto-increments based on existing codes (e.g. AC0001, AC0002)
 */
export async function generateRfoId(): Promise<string> {
  const prefix = "AC";

  // Find the highest existing sequence number starting with AC
  const lastRfq = await prisma.rFQ.findFirst({
    where: {
      rfqCode: { startsWith: prefix },
    },
    orderBy: { rfqCode: "desc" },
    select: { rfqCode: true },
  });

  let nextSeq = 1;
  if (lastRfq && lastRfq.rfqCode.length > 2) {
    const numPart = lastRfq.rfqCode.substring(2);
    const lastSeq = parseInt(numPart, 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  const paddedSeq = String(nextSeq).padStart(4, "0");
  return `${prefix}${paddedSeq}`;
}
