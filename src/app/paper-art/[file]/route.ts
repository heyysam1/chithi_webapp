import { STARRY_WEBP_BASE64 } from "@/lib/artwork/starryWebp";
import { BLOSSOM_WEBP_BASE64 } from "@/lib/artwork/blossomWebp";

// Illustrated paper artwork is embedded as base64 data modules and
// served from here, so the deployed files stay byte-identical to the
// originals. Responses are immutable and CDN-cached for a year.
const FILES: Record<string, string> = {
  "starry.webp": STARRY_WEBP_BASE64,
  "blossom.webp": BLOSSOM_WEBP_BASE64,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const base64 = FILES[file];
  if (!base64) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(Buffer.from(base64, "base64"), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
