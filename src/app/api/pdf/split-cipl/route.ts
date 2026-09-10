import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createWorker } from "tesseract.js";
import { fromBuffer } from "pdf2pic";
import path from "node:path";
import stringSimilarity from "string-similarity";

// ====================================================================
// Tesseract.js local model setup
// Nếu không có local model, nó sẽ thử tải từ CDN (có thể bị lỗi firewall/timeout).
// Chạy: npm install @tesseract.js-data/eng để có model local.
// ====================================================================
const TESSDATA_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0_best_int"
);

// Cho phép route chạy lâu hơn mặc định (OCR nhiều trang tốn th�i gian).
// Vercel: cần gói trả phí để tăng quá giới hạn 10s/60s mặc định.
export const maxDuration = 90;

// ====================================================================
// FUZZY TEXT UTILITIES
// ====================================================================

function normalizeForOcr(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Bỏ dấu tiếng Việt
    .replace(/[0O]/g, "O")           // OCR hay nhầm 0 và O
    .replace(/[1Il|]/g, "I")         // OCR hay nhầm 1, I, l
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function fuzzyMatch(text: string, pattern: string): number {
  const textNorm = normalizeForOcr(text);
  const patternNorm = normalizeForOcr(pattern);
  return stringSimilarity.compareTwoStrings(textNorm, patternNorm);
}

// ====================================================================
// ANCHOR CONFIGURATION
// ====================================================================

interface AnchorConfig {
  keyword: string;
  normalized: string;
  category: "CERTIFICATE" | "INVOICE" | "PACKING";
}

const ANCHOR_LIST: AnchorConfig[] = [
  // Certificate variants (main split targets) - thứ tự từ dài nhất -> ngắn nhất
  { keyword: "CERTIFICATE OF COMPLIANCE", normalized: "", category: "CERTIFICATE" as const },
  { keyword: "CERTIFICATE OF CONFORMANCE", normalized: "", category: "CERTIFICATE" as const },
  { keyword: "CERTIFICATE OF CONFORMITY", normalized: "", category: "CERTIFICATE" as const },
  { keyword: "CERTIFICATE OF ORIGIN", normalized: "", category: "CERTIFICATE" as const },
  { keyword: "CERTIFICATE OF QUALITY", normalized: "", category: "CERTIFICATE" as const },
  { keyword: "CERTIFICATE OF INSPECTION", normalized: "", category: "CERTIFICATE" as const },
  { keyword: "CERTIFICATE", normalized: "", category: "CERTIFICATE" as const },

  // Invoice (should NOT trigger split)
  { keyword: "COMMERCIAL INVOICE", normalized: "", category: "INVOICE" as const },
  { keyword: "INVOICE", normalized: "", category: "INVOICE" as const },

  // Packing (should NOT trigger split)
  { keyword: "PACKING LIST", normalized: "", category: "PACKING" as const },
  { keyword: "PACK SLIP", normalized: "", category: "PACKING" as const },
].map(a => ({ ...a, normalized: normalizeForOcr(a.keyword) }));

// Certificate anchors only (exclude INVOICE/PACKING)
const CERTIFICATE_ANCHORS = ANCHOR_LIST.filter(a => a.category === "CERTIFICATE");

// For debugging: all anchor keywords
const ALL_ANCHORS_DEBUG = ANCHOR_LIST.map(a => a.keyword).join(", ");

// ====================================================================
// PAGE SIZE UTILITIES - Tách theo kích thước trang (không cần OCR)
// ====================================================================

interface PageSize {
  width: number;
  height: number;
}

/**
 * Lấy kích thước (pt) của từng trang trong PDF.
 * CIPL thường là A4 portrait (595 x 842 pt).
 * COC/COO có thể là Letter (612 x 792) hoặc khổ khác.
 */
async function getPageSizes(buffer: Buffer): Promise<PageSize[]> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const sizes: PageSize[] = [];
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    sizes.push({ width, height });
  }
  return sizes;
}

/**
 * Tìm điểm tách dựa trên sự thay đổi kích thước trang.
 * Trả về chỉ số trang (0-based) bắt đầu của file COO/COC,
 * hoặc -1 nếu không tìm thấy sự thay đổi đáng kể.
 *
 * Logic:
 * 1. Lấy kích thước trang đầu tiên làm "baseline" (CIPL).
 * 2. Tìm trang đầu tiên có kích thước khác baseline một cách đáng kể
 *    (chênh lệch >= 10pt ở width hoặc height).
 * 3. Đó chính là trang bắt đầu của Certificate/COO/COC.
 */
function findSplitBySizeChange(sizes: PageSize[]): {
  splitIndex: number;
  baselineSize: PageSize;
  newSize: PageSize;
} | null {
  if (sizes.length < 2) return null;

  const baseline = sizes[0];
  const SIZE_TOLERANCE = 10; // pt - chênh lệch cho phép do làm tròn

  // Tìm trang đầu tiên có kích thước KHÁC baseline đáng kể
  for (let i = 1; i < sizes.length; i++) {
    const current = sizes[i];
    const widthDiff = Math.abs(current.width - baseline.width);
    const heightDiff = Math.abs(current.height - baseline.height);

    // Bỏ qua trang cùng orientation (cả portrait hoặc cả landscape)
    const sameOrientation = (current.width > current.height) === (baseline.width > baseline.height);

    if (widthDiff > SIZE_TOLERANCE || heightDiff > SIZE_TOLERANCE) {
      // Đây là trang bắt đầu của COO/COC
      return {
        splitIndex: i,
        baselineSize: baseline,
        newSize: current,
      };
    }
    // Nếu chỉ khác orientation (portrait -> landscape) nhưng size gần giống -> bỏ qua
    void sameOrientation;
  }

  return null;
}

// ====================================================================
// HELPER: Check if image buffer is valid
// ====================================================================

function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const jpegSig = Buffer.from([0xFF, 0xD8, 0xFF]);
  return buffer.slice(0, 8).equals(pngSig) || buffer.slice(0, 3).equals(jpegSig);
}

// ====================================================================
// MAIN HANDLER
// ====================================================================

export async function POST(req: NextRequest) {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rfqCode = (formData.get("rfqCode") as string) || "UNKNOWN";
    const method = (formData.get("method") as string) || "auto"; // "size" | "ocr" | "auto"

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy file đính kèm." },
        { status: 400 }
      );
    }

    console.log(`[SPLIT-CIPL] Processing: ${file.name} (${file.size} bytes), method=${method}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const originalPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const totalPages = originalPdf.getPageCount();

    // ====================================================================
    // BƯỚC 1: LẤY KÍCH THƯỚC TỪNG TRANG (nhanh, không cần render)
    // ====================================================================
    const pageSizes = await getPageSizes(buffer);
    console.log(`[SPLIT-CIPL] Page sizes:`, pageSizes.map(s => `${Math.round(s.width)}x${Math.round(s.height)}`).join(", "));

    let splitPageIndex = -1;
    let detectMethod: "size" | "ocr" | null = null;
    let sizeInfo: { baselineSize: PageSize; newSize: PageSize } | null = null;
    let bestMatch: { page: number; anchor: string; similarity: number } | null = null;

    // ====================================================================
    // BƯỚC 2: THỬ TÁCH THEO KÍCH THƯỚC TRƯỚC (ưu tiên)
    // ====================================================================
    if (method === "size" || method === "auto") {
      const sizeResult = findSplitBySizeChange(pageSizes);
      if (sizeResult) {
        splitPageIndex = sizeResult.splitIndex;
        sizeInfo = {
          baselineSize: sizeResult.baselineSize,
          newSize: sizeResult.newSize,
        };
        detectMethod = "size";
        console.log(`[SPLIT-CIPL] ✓ Size-based split at page ${splitPageIndex + 1} (${Math.round(sizeResult.baselineSize.width)}x${Math.round(sizeResult.baselineSize.height)} -> ${Math.round(sizeResult.newSize.width)}x${Math.round(sizeResult.newSize.height)})`);
      } else if (method === "size") {
        // User yêu cầu dùng size nhưng không tìm thấy -> báo lỗi
        return NextResponse.json({
          success: false,
          error: "❌ Không tìm thấy sự thay đổi kích thước trang trong file. Tất cả các trang có cùng kích thước.",
          needsReview: true,
          debug: {
            totalPages,
            pageSizes: pageSizes.map((s, i) => ({ page: i + 1, w: Math.round(s.width), h: Math.round(s.height) })),
          },
        }, { status: 422 });
      }
    }

    // ====================================================================
    // BƯỚC 3: FALLBACK - TÁCH THEO OCR (nếu size không hiệu quả)
    // ====================================================================
    if (splitPageIndex === -1 && (method === "ocr" || method === "auto")) {
      console.log(`[SPLIT-CIPL] Size-based detection failed. Falling back to OCR...`);

      // Khởi tạo Tesseract worker với local model (nếu có)
      let langPath: string | undefined;
      let cachePath: string | undefined;

      try {
        const fs = await import("fs");
        if (fs.existsSync(TESSDATA_PATH)) {
          langPath = TESSDATA_PATH;
          cachePath = TESSDATA_PATH;
          console.log("[SPLIT-CIPL] Using local Tesseract model");
        }
      } catch {
        console.log("[SPLIT-CIPL] Local model not found, using CDN");
      }

      worker = await createWorker("eng", 1, { langPath, cachePath });

      const options = {
        density: 200,
        saveFilename: "temp_page",
        savePath: "/tmp",
        format: "png",
      };
      const convert = fromBuffer(buffer, options);

      interface OcrResult {
        pageNum: number;
        textPreview: string;
        foundAnchor: string | null;
        similarity: number;
      }

      const ocrResults: OcrResult[] = [];

      for (let i = 1; i <= totalPages; i++) {
        console.log(`[OCR] Scanning page ${i}/${totalPages}...`);

        try {
          const pageImage = await convert(i, { responseType: "buffer" });
          const imageBuffer = pageImage.buffer as Buffer;

          if (!imageBuffer || !isValidImageBuffer(imageBuffer)) {
            console.error(`[OCR_PAGE_ERROR] Page ${i}: Invalid image buffer`);
            ocrResults.push({ pageNum: i, textPreview: "", foundAnchor: null, similarity: 0 });
            continue;
          }

          const { data: { text } } = await worker.recognize(imageBuffer);

          let foundAnchor: string | null = null;
          let bestSimilarity = 0;

          for (const anchor of CERTIFICATE_ANCHORS) {
            const similarity = fuzzyMatch(text, anchor.keyword);
            if (similarity >= 0.85) {
              foundAnchor = anchor.keyword;
              bestSimilarity = similarity;
              console.log(`  -> Match "${anchor.keyword}" (similarity: ${(similarity * 100).toFixed(1)}%)`);
              break;
            }
          }

          ocrResults.push({
            pageNum: i,
            textPreview: text.substring(0, 150),
            foundAnchor,
            similarity: bestSimilarity,
          });

          if (foundAnchor && splitPageIndex < 0) {
            splitPageIndex = i - 1;
            bestMatch = { page: i, anchor: foundAnchor, similarity: bestSimilarity };
            console.log(`[SPLIT-CIPL] ✓ Found "${foundAnchor}" at page ${i}`);
          }
        } catch (pageErr: any) {
          console.error(`[OCR_PAGE_ERROR] Page ${i}:`, pageErr.message || pageErr);
          ocrResults.push({ pageNum: i, textPreview: "", foundAnchor: null, similarity: 0 });
        }
      }

      if (splitPageIndex > 0) {
        detectMethod = "ocr";
      } else {
        // OCR cũng không tìm thấy
        return NextResponse.json({
          success: false,
          error: "❌ Không tìm thấy tiêu đề CERTIFICATE để tách bằng OCR. File có thể không đúng format hoặc tiêu đề bị OCR sai.",
          needsReview: true,
          debug: {
            totalPages,
            pageSizes: pageSizes.map((s, i) => ({ page: i + 1, w: Math.round(s.width), h: Math.round(s.height) })),
            ocrResults: ocrResults.slice(0, 5),
            suggestedAnchors: ALL_ANCHORS_DEBUG,
          },
        }, { status: 422 });
      }
    }

    // ====================================================================
    // BƯỚC 4: KIỂM TRA KẾT QUẢ
    // ====================================================================
    if (splitPageIndex <= 0) {
      console.log(`[SPLIT-CIPL] ⚠️ No anchor/size change found.`);
      return NextResponse.json({
        success: false,
        error: "� Không thể xác định điểm tách. File có thể chỉ chứa 1 phần (chỉ CIPL hoặc chỉ COC).",
        needsReview: true,
        debug: {
          totalPages,
          pageSizes: pageSizes.map((s, i) => ({ page: i + 1, w: Math.round(s.width), h: Math.round(s.height) })),
        },
      }, { status: 422 });
    }

    // ====================================================================
    // BƯỚC 5: TÁCH FILE
    // ====================================================================
    console.log(`[SPLIT-CIPL] Splitting at page ${splitPageIndex + 1} (method: ${detectMethod})...`);

    // CHIẾN LƯỢC TÁCH AN TOÀN VỚI SCAN PDF:
    // pdf-lib không preserve tốt các Form XObject / image stream phức tạp từ
    // scan PDF (làm trang kết quả bị trắng). Cách an toàn:
    // 1. Clone PDF gốc thành 2 bản (giữ nguyên stream & resources)
    // 2. removePage() trang không cần trong mỗi bản
    // => File kết quả chỉ chứa các trang mong muốn, scan quality nguyên vẹn.

    // File 1: CIPL (trang 0 -> splitPageIndex-1)
    const ciplDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const ciplTotal = ciplDoc.getPageCount();
    // Xóa từ cuối về đầu để index không bị shift
    for (let i = ciplTotal - 1; i >= splitPageIndex; i--) {
      ciplDoc.removePage(i);
    }
    // useObjectStreams: false → tương thích tốt hơn với mọi PDF reader
    // updateFieldAppearances: false → tránh lỗi khi không có form
    const ciplBytes = await ciplDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });
    const ciplBase64 = `data:application/pdf;base64,${Buffer.from(ciplBytes).toString("base64")}`;

    // File 2: COO/COC (trang splitPageIndex -> cuối)
    const cooDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    // Xóa các trang đầu (0 -> splitPageIndex-1)
    for (let i = splitPageIndex - 1; i >= 0; i--) {
      cooDoc.removePage(i);
    }
    const cooBytes = await cooDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });
    const cooBase64 = `data:application/pdf;base64,${Buffer.from(cooBytes).toString("base64")}`;

    // ====================================================================
    // BƯỚC 6: TRẢ KẾT QUẢ
    // ====================================================================
    return NextResponse.json({
      success: true,
      splitPageIndex: splitPageIndex + 1,
      detectMethod, // "size" hoặc "ocr"
      matchInfo: bestMatch,
      sizeInfo: sizeInfo ? {
        baselineSize: { width: Math.round(sizeInfo.baselineSize.width), height: Math.round(sizeInfo.baselineSize.height) },
        newSize: { width: Math.round(sizeInfo.newSize.width), height: Math.round(sizeInfo.newSize.height) },
      } : null,
      file1: {
        defaultName: `CIPL_${rfqCode}.pdf`,
        label: "Commercial Invoice + Packing List",
        pageRange: `Page 1 → ${splitPageIndex}`,
        base64: ciplBase64,
        pageCount: splitPageIndex,
      },
      file2: {
        defaultName: `COO_COC_${rfqCode}.pdf`,
        label: "Certificate of Origin / Compliance + Reports",
        pageRange: `Page ${splitPageIndex + 1} → ${totalPages}`,
        base64: cooBase64,
        pageCount: totalPages - splitPageIndex,
      },
      debug: {
        totalPages,
        pageSizes: pageSizes.map((s, i) => ({ page: i + 1, w: Math.round(s.width), h: Math.round(s.height) })),
      },
    });

  } catch (error: any) {
    console.error("[SPLIT-CIPL_ERROR]", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
