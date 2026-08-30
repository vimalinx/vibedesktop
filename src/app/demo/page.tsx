import type { Metadata } from "next";
import { SiteSampleApp } from "@/components/demo/site-sample-app";

export const metadata: Metadata = {
  title: "Vibe Memo · Vibe Desktop Sample",
  description: "A small note app provided by Vibe Desktop for the guided tour.",
  robots: { index: false, follow: false }
};

export default async function DemoPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <SiteSampleApp locale={lang === "en" ? "en" : "zh"} />;
}
