"use client";

import { useEffect } from "react";
import { seenAction } from "@/app/actions/nastenka";

/** Po otevření nástěnky se příspěvky označí jako viděné (odznak v menu zmizí). */
export function BoardSeen({ unseen }: { unseen: boolean }) {
  useEffect(() => {
    if (unseen) void seenAction();
  }, [unseen]);
  return null;
}
