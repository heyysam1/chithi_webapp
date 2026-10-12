import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "MyChithi - Anonymous Private Letters" },
  description:
    "Benami Kham - a public wall of anonymous letters. Read secret notes people chose to share, in Bangla or English.",
  alternates: { canonical: "/feed" },
};

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
