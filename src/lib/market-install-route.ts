import { apiError } from "@/lib/api-response";
import { AuthRequiredError } from "@/lib/auth";
import { MarketInstallError } from "@/lib/market-installer";

/** Market errors carry their own HTTP status; validation problems are listed one per line. */
export function marketRouteError(error: unknown, fallback: string) {
  if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
  if (error instanceof MarketInstallError) {
    const message = error.details?.length ? `${error.message}\n${error.details.map((line) => `- ${line}`).join("\n")}` : error.message;
    return apiError(error.status, error.code, message);
  }
  return apiError(500, fallback, error instanceof Error ? error.message : "The market request failed.");
}
