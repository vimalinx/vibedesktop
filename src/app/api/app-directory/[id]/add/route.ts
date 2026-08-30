import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { loadMergedDirectory } from "@/lib/catalog-source";
import { addDirectoryApp } from "@/lib/persistence";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    // Resolve against the same merged set GET returns: an entry the store can
    // list must be an entry the desktop can add, whether it came from the
    // built-in seed, the public catalog, or the user's own file.
    const directory = await loadMergedDirectory();
    const app = directory.find((item) => item.id === id);

    if (!app) {
      return apiError(404, "directory_app_not_found", "Directory app not found.");
    }

    const payload = await addDirectoryApp(user, app);

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }

    throw error;
  }
}
