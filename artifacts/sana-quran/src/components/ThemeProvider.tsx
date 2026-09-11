import { createContext, useContext, useEffect, useState } from "react";

/* ─── Dark-mode context ─── */
interface DarkModeContextValue {
  isDark: boolean;
  toggleDark: () => void;
}
const DarkModeContext = createContext<DarkModeContextValue>({ isDark: false, toggleDark: () => {} });

export function useTheme() {
  return useContext(DarkModeContext);
}

/* ─── White-label colour helpers ─── */
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTheme(primaryHsl?: string, secondaryHsl?: string, sidebarHsl?: string) {
  const root = document.documentElement;
  if (primaryHsl) {
    root.style.setProperty("--primary", primaryHsl);
    root.style.setProperty("--sidebar", primaryHsl);
  }
  if (secondaryHsl) {
    root.style.setProperty("--secondary", secondaryHsl);
    root.style.setProperty("--ring", secondaryHsl);
  }
  if (sidebarHsl) {
    root.style.setProperty("--sidebar", sidebarHsl);
    root.style.setProperty("--sidebar-primary", sidebarHsl);
  }
}

export function applyThemeFromHex(primary: string, secondary: string, sidebar: string) {
  applyTheme(hexToHsl(primary), hexToHsl(secondary), hexToHsl(sidebar));
}

export function resetTheme() {
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--secondary");
  root.style.removeProperty("--sidebar");
  root.style.removeProperty("--sidebar-primary");
  root.style.removeProperty("--ring");
}

export function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* ─── Combined provider ─── */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem("sana_dark") === "1"; } catch { return false; }
  });

  /* Apply dark class */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try { localStorage.setItem("sana_dark", isDark ? "1" : "0"); } catch {}
  }, [isDark]);

  /* Apply white-label colours on mount */
  useEffect(() => {
    const primary   = (import.meta as any).env?.VITE_PRIMARY_HSL as string | undefined;
    const secondary = (import.meta as any).env?.VITE_SECONDARY_HSL as string | undefined;
    const sidebar   = (import.meta as any).env?.VITE_SIDEBAR_HSL as string | undefined;
    const schoolName = (import.meta as any).env?.VITE_SCHOOL_NAME as string | undefined;
    const logoUrl   = (import.meta as any).env?.VITE_LOGO_URL as string | undefined;
    if (primary || secondary || sidebar) applyTheme(primary, secondary, sidebar);
    if (schoolName) document.title = schoolName;
    if (logoUrl) {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (link) link.href = logoUrl;
    }
  }, []);

  const toggleDark = () => setIsDark(v => !v);

  return (
    <DarkModeContext.Provider value={{ isDark, toggleDark }}>
      {children}
    </DarkModeContext.Provider>
  );
}
