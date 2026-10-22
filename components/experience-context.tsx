import { experienceLabel, type Preferences } from "@/lib/preferences";
export function ExperienceContext({ preferences }: { preferences: Preferences }) {
  if (preferences.years === null) return null;
  return <p className="experience-context"><strong>내 경력 · {experienceLabel(preferences.years)}</strong><span>아래 필수·우대 조건과 비교해 보세요. 연차만으로 지원 가능 여부를 판정하지 않아요.</span></p>;
}
