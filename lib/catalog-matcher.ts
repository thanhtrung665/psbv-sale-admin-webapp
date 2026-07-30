import { prisma } from "./prisma";

export interface StandardPartMatch {
  standardPartNo: string;
  standardDescription: string;
  uom: string;
}

export async function matchStandardPartNumber(
  rawDescription: string,
  rawPartNumber: string
): Promise<StandardPartMatch | null> {
  // Step 1: Match by description (fuzzy / ILike)
  if (rawDescription) {
    const partByDesc = await prisma.masterPart.findFirst({
      where: {
        description: {
          contains: rawDescription.trim(),
          mode: "insensitive",
        },
      },
    });

    if (partByDesc) {
      return {
        standardPartNo: partByDesc.partNumber,
        standardDescription: partByDesc.description,
        uom: partByDesc.uom,
      };
    }
  }

  // Step 2: Match by part number (exact/insensitive)
  if (rawPartNumber) {
    const partByNo = await prisma.masterPart.findFirst({
      where: {
        partNumber: {
          equals: rawPartNumber.trim(),
          mode: "insensitive",
        },
      },
    });

    if (partByNo) {
      return {
        standardPartNo: partByNo.partNumber,
        standardDescription: partByNo.description,
        uom: partByNo.uom,
      };
    }
  }

  // Step 3: No match found
  return null;
}
