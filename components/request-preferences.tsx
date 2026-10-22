import { Suspense } from "react";
import { readPreferences } from "@/lib/preference-store";
import { PreferenceBar } from "./preference-bar";
import { NavigationMemory } from "./navigation-memory";
import { ExperienceContext } from "./experience-context";

/** Request-only islands: the public layout/content never owns cookie values. */
export async function RequestPreferences() {
  const preferences = await readPreferences();
  return <><Suspense fallback={null}><NavigationMemory preferredRole={preferences.role} preferredSizes={preferences.sizes} /></Suspense><PreferenceBar preferences={preferences} /></>;
}
export async function RequestExperience() {
  return <ExperienceContext preferences={await readPreferences()} />;
}
