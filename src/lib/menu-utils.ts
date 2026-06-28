export function isHamburgerCategory(slug?: string | null, name?: string | null) {
  const text = `${slug ?? ""} ${name ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return text.includes("hamburg") || text.includes("especial") || text.includes("tradicion");
}