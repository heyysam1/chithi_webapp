"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { FeedFilterTabs } from "@/components/feed/FeedFilterTabs";
import { FeedGrid } from "@/components/feed/FeedGrid";
import { ReportDialog } from "@/components/system/ReportDialog";
import { Badge } from "@/components/ui/Badge";
import { FeedItemWithViewer } from "@/lib/feed";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import { useLocalReactions } from "@/hooks/useLocalReactions";

export default function FeedPage() {
  const { t } = useLocale();
  const { showToast } = useToast();
  const { markReacted } = useLocalReactions();

  const [activeTab, setActiveTab] = useState<"trending" | "latest">("trending");
  const [items, setItems] = useState<FeedItemWithViewer[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Report dialog state
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);

  const fetchFeed = useCallback(
    async (tab: "trending" | "latest", cursor?: string | null, append = false) => {
      if (!append) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
        const res = await fetch(`/api/feed?tab=${tab}${query}`);
        const json = await res.json();

        if (json.ok) {
          const newItems: FeedItemWithViewer[] = json.data.items || [];
          if (append) {
            setItems((prev) => [...prev, ...newItems]);
          } else {
            setItems(newItems);
          }
          setNextCursor(json.data.nextCursor);
        } else {
          showToast(t(json.error?.message || "errors.generic"), "error");
        }
      } catch {
        showToast(t("errors.generic"), "error");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [showToast, t]
  );

  useEffect(() => {
    fetchFeed(activeTab, null, false);
  }, [activeTab, fetchFeed]);

  const handleReact = async (
    feedId: string,
    reaction: "heart" | "heartCrack"
  ) => {
    // Client-side cache update (§13)
    markReacted(feedId);

    const res = await fetch(`/api/feed/${feedId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction }),
    });

    const json = await res.json();
    if (!json.ok) {
      if (res.status === 409) {
        showToast(t("errors.alreadyReacted"), "warn");
      } else {
        throw new Error(json.error?.message || "errors.generic");
      }
    }
  };

  return (
    <PageShell>
      <div className="space-y-8">
        {/* Wall Header */}
        <div className="border-b border-edge pb-6 space-y-2">
          <Badge variant="buttercup">{t("feed.badge")}</Badge>

          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-ink">
              {t("feed.title")}
            </h1>
            {t("feed.title") !== t("feed.nativeTitle") && (
              <span className="text-xl sm:text-2xl font-serif text-wax font-normal">
                {t("feed.nativeTitle")}
              </span>
            )}
          </div>

          <p className="text-sm text-ink-muted max-w-xl leading-relaxed">
            {t("feed.subtitle")}
          </p>
        </div>

        {/* Filter Tabs: Trending vs Latest */}
        <FeedFilterTabs
          activeTab={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);
          }}
        />

        {/* Feed Masonry Grid */}
        <FeedGrid
          items={items}
          isLoading={isLoading}
          hasMore={nextCursor !== null}
          isLoadingMore={isLoadingMore}
          onLoadMore={() => {
            if (nextCursor !== null) {
              fetchFeed(activeTab, nextCursor, true);
            }
          }}
          onReact={handleReact}
          onReport={(id) => setReportTargetId(id)}
        />

        {/* Report Modal */}
        <ReportDialog
          isOpen={Boolean(reportTargetId)}
          onClose={() => setReportTargetId(null)}
          targetType="feed"
          targetId={reportTargetId}
        />
      </div>
    </PageShell>
  );
}
