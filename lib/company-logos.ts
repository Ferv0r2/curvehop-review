import demoCompanies from "../data/demo-companies.json";
/** Original monograms for fictional review companies; no third-party assets. */
export const companyLogos: Record<string, { src: string; brand: string; wide?: boolean }> = Object.fromEntries(demoCompanies.map(company => [company.id, {src:`/company-logos/${company.id}.svg`,brand:company.name}]));
