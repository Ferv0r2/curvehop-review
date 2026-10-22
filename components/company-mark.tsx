"use client";

import { useContext, useState } from "react";
import Image from "next/image";
import { companyLogos } from "@/lib/company-logos";
import { CompanyIconsContext } from "./company-icons";

/**
 * Adjacent text supplies the company name; the mark is decorative identification.
 * A collected icon shows only when the layout's CompanyIconsProvider lists the
 * company, which it does only when the icon route would serve it; otherwise the initial.
 */
export function CompanyMark({
  companyId, name, color, className = "reading-company-mark",
}: {
  companyId?: string | null;
  name: string;
  color: string;
  className?: string;
}) {
  const icons = useContext(CompanyIconsContext);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const curated = companyId && Object.hasOwn(companyLogos, companyId)
    ? companyLogos[companyId] : undefined;
  const iconSrc = companyId && Object.hasOwn(icons, companyId) ? icons[companyId] : undefined;
  const candidate = curated ?? (iconSrc ? { src: iconSrc, brand: name, wide: false } : undefined);
  const logo = candidate?.src !== failedSrc ? candidate : undefined;
  // Resize local raster originals automatically, including future curated logos.
  // SVG/ICO and receipt-verified collected icons retain their original format.
  const optimize = logo && /^\/company-logos\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(logo.src);
  return (
    <span
      className={`${className} company-mark${logo ? " has-logo" : ""}${logo?.wide ? " wordmark" : ""}`}
      style={{ backgroundColor: logo ? "#fff" : color }}
      aria-hidden="true"
      title={logo ? `${logo.brand} 로고` : undefined}
    >
      {logo ? optimize
        ? <Image src={logo.src} alt="" width={48} height={48} sizes={className.includes("large") ? "96px" : "48px"} loading="lazy" onError={() => setFailedSrc(logo.src)} />
        : <img src={logo.src} alt="" width={48} height={48} loading="lazy" decoding="async" onError={() => setFailedSrc(logo.src)} />
        : name.slice(0, 1)}
    </span>
  );
}
