"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { roleLabels } from "@/lib/jobs";
import { preferenceCookie, preferenceReturn } from "@/lib/preferences";
import { parseSizes } from "@/lib/company-size-bands";

export async function savePreferences(_state: { error: string }, data: FormData): Promise<{ error: string }> {
  const reset = data.get("intent") === "reset";
  const role = data.get("role") ?? "";
  const rawYears = data.get("years") ?? "";
  const rawSizes = data.getAll("size");
  const sizes = parseSizes(rawSizes, { allowUnknown: false });
  if (!reset && (sizes.length !== rawSizes.length || typeof role !== "string" || (role !== "" && !Object.hasOwn(roleLabels, role)) || typeof rawYears !== "string" || (rawYears !== "" && !/^(?:[0-9]|[12][0-9]|30)$/.test(rawYears)))) {
    return { error: "목록에서 직무·경력·회사 규모를 선택해 주세요. 선택하지 않아도 괜찮아요." };
  }
  const jar = await cookies();
  if (reset || (role === "" && rawYears === "" && sizes.length === 0)) jar.delete(preferenceCookie);
  else jar.set(preferenceCookie, JSON.stringify({ role, years: rawYears === "" ? null : Number(rawYears), sizes }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  // Cookie mutations refresh the Router Cache. Public data is unchanged;
  // invalidating the deployment-wide prerender cache is unnecessary.
  redirect(preferenceReturn(data.get("returnTo")));
}
