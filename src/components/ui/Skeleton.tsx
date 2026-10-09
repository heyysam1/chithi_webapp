import React from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      aria-hidden="true"
      className={`animate-pulse bg-edge/80 rounded-xl ${className}`}
    />
  );
}
