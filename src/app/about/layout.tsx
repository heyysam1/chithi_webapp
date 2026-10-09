import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "What MyChithi is: send anonymous letters that vanish after reading. No signup, no tracking — in Bangla or English.",
  alternates: { canonical: "/about" },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
