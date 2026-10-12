import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "MyChithi - Anonymous Private Letters" },
  description:
    "Cast a message in a bottle - your anonymous letter drifts to a stranger's inbox. No signup, no tracking.",
  alternates: { canonical: "/bottle" },
};

export default function BottleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
