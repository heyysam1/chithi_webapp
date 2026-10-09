import type { Metadata } from "next";

/**
 * The admin dashboard is unlisted: no nav links point here and it must
 * never appear in search results.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
