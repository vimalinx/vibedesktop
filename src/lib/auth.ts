import type { VibeUser } from "@/lib/contracts";
import { getOrCreateUser } from "@/lib/persistence";

/**
 * Pure-local single-user identity: there is no login. The first request
 * auto-provisions one local user and every later request resolves to it.
 */
const localIdentity = {
  identityIssuer: "local:vibe-desktop",
  identitySubject: "local:owner",
  email: "owner@localhost",
  emailVerified: false,
  displayName: "Owner",
  avatarUrl: null
};

export async function getCurrentUser(): Promise<VibeUser | null> {
  return getOrCreateUser(localIdentity);
}

export async function requireCurrentUser(): Promise<VibeUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError();
  return user;
}

export class AuthRequiredError extends Error {
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}
