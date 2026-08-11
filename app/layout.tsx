import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D&D Companion — лист персонажа",
  description: "Совместный лист персонажа и книга заклинаний для D&D 5e 2024.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
