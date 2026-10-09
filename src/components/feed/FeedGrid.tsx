"use client";

import type { FeedItemWithViewer } from "@/lib/feed";
import { FeedCard } from "./FeedCard";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import { useLocale } from "@/hooks/useLocale";

export interface FeedGridProps {
  items: FeedItemWithViewer[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  onReact: (feedId: string, reaction: "heart" | "heartCrack") => Promise<void>;
  onReport: (feedId: string) => void;
}

export function FeedGrid({
  items,
  isLoading,
  hasMore,
  onLoadMore,
  isLoadingMore,
  onReact,
  onReport,
}: FeedGridProps) {
  const { t } = useLocale();

  if (isLoading) {
    return (
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="break-inside-avoid rounded-3xl border border-edge bg-surface p-5 space-y-4 shadow-sm"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-28 w-full" />
            <div className="flex justify-between items-center pt-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title={t("feed.emptyTitle")}
          description={t("feed.empty")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Pure CSS Masonry columns (§13) */}
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">
        {items.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            onReact={onReact}
            onReport={onReport}
          />
        ))}
      </div>

      {/* Manual Cursor-based Load More Button (§13) */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="md"
            onClick={onLoadMore}
            isLoading={isLoadingMore}
          >
            {t("feed.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
