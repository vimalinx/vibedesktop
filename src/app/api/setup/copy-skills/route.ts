import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { buildAddAppSkillInstallCommand } from "@/lib/add-app-skill-contract";

export const runtime = "nodejs";

// A cloud route cannot write into the browser user's home directory. Return a
// local installer command that the UI can copy for their on-device agent.
export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    return NextResponse.json({
      ok: true,
      skill: "add_app",
      installCommand: buildAddAppSkillInstallCommand(request.url)
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }
    throw error;
  }
}
