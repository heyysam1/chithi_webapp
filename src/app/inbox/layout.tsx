import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "MyChithi - Anonymous Private Letters" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: null },
};

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
