"use client";

import { useState } from "react";
import { setBoard } from "@/app/actions/nastenka";
import { ActionForm, Submit } from "./forms";
import { SwitchRow } from "./SwitchRow";

/** Nástěnka třídy u třídy (jen správce): zapnutí modulu. */
export function BoardClassForm({ classId, enabled }: { classId: number; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <ActionForm action={setBoard} resetOnSuccess={false}>
      <input type="hidden" name="class" value={classId} />
      <SwitchRow name="enabled" label="Nástěnka třídy" hint="Spolužáci a správce sem dávají oznámení, akce, ankety a nabídky; jde reagovat a komentovat" checked={on} onChange={setOn} />
      <div><Submit>Uložit</Submit></div>
    </ActionForm>
  );
}
