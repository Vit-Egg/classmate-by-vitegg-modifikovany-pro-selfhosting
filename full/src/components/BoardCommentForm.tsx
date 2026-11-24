"use client";

import { commentAction } from "@/app/actions/nastenka";
import { ActionForm, Submit } from "./forms";

export function BoardCommentForm({ postId }: { postId: number }) {
  return (
    <ActionForm action={commentAction} className="bd-comment-form">
      <input type="hidden" name="post" value={postId} />
      <div className="bd-comment-row">
        <input className="input" name="body" required maxLength={500} autoComplete="off" placeholder="Napiš komentář…" aria-label="Komentář" />
        <Submit className="btn small primary" pendingText="…">Odeslat</Submit>
      </div>
    </ActionForm>
  );
}
