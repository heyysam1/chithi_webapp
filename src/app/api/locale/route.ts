import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const locale = body?.locale === "bn" ? "bn" : "en";

    const res = NextResponse.json({ ok: true, locale });
    res.headers.set("Cache-Control", "no-store");
    res.cookies.set("chithi_locale", locale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      httpOnly: false,
    });
    return res;
  } catch {
    const err = NextResponse.json({ ok: false }, { status: 400 });
    err.headers.set("Cache-Control", "no-store");
    return err;
  }
}
