import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { decodePreferences, preferenceCookie } from "./preferences";
export const readPreferences = cache(async () => {
  return decodePreferences((await cookies()).get(preferenceCookie)?.value);
});
