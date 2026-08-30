import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  buildAddAppSkillInstaller,
  listAddAppSkillFileNames,
  type AddAppSkillFiles
} from "@/lib/add-app-skill-installer";
import { apiError } from "@/lib/api-response";

export const runtime = "nodejs";

/**
 * Public, self-contained installer for the non-secret add_app skill. Keeping
 * installation local is essential: the cloud app cannot write into the
 * browser user's ~/.claude directory.
 */
export async function GET() {
  try {
    const skillRoot = path.join(process.cwd(), ".claude", "skills", "add_app");
    const entries = await Promise.all(
      listAddAppSkillFileNames().map(async (name) => [name, await readFile(path.join(skillRoot, name))] as const)
    );
    const installer = buildAddAppSkillInstaller(Object.fromEntries(entries) as AddAppSkillFiles);

    return new NextResponse(installer, {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        "content-disposition": 'inline; filename="install-vibedesktop-add-app.sh"',
        "content-type": "text/x-shellscript; charset=utf-8",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return apiError(503, "skill_unavailable", "The add_app skill installer is unavailable.");
  }
}
