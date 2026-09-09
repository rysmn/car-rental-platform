import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/guard";
import { mimeForInvoice, resolveInvoicePath } from "@/lib/storage/invoices";

/**
 * Serves an uploaded invoice — to a logged-in admin only.
 *
 * The public `/api/media` reader deliberately has no auth check because it
 * serves marketing photographs. This one is its opposite number: same
 * traversal defences, plus a session check, plus `no-store` so an invoice never
 * lingers in a shared cache after a logout.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const admin = await currentAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });

  const { path: segments } = await params;
  const filePath = resolveInvoicePath(segments);
  if (!filePath) return new NextResponse("Not found", { status: 404 });

  const contentType = mimeForInvoice(filePath);
  if (!contentType) return new NextResponse("Not found", { status: 404 });

  try {
    const file = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        // `inline` so a PDF opens in the viewer rather than downloading, but
        // with a sniffing block: a stored file must be rendered as the type its
        // magic bytes proved, never as whatever the browser guesses.
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
