import { NextResponse } from "next/server";
import { loadMergedDirectory } from "@/lib/catalog-source";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    items: await loadMergedDirectory()
  });
}
