import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/guard";
import { getStorage } from "@/lib/storage";
import { resolveSignaturePath } from "@/lib/storage/signatures";

/**
 * Serves a handover signature — to a logged-in admin only.
 *
 * Same shape as the invoice reader and for a stronger reason: a signature is
 * personal data AND the evidence a protocol rests on. `no-store` so it never
 * lingers in a shared cache after a logout, `nosniff` so a stored file is
 * rendered as the type its magic bytes proved.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const admin = await currentAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });

  const { path: segments } = await params;
  const key = resolveSignaturePath(segments);
  if (!key) return new NextResponse("Not found", { status: 404 });

  try {
    const file = await getStorage().get(key);
    if (!file) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
