"use client";

import { useState } from "react";
import { setDuty } from "@/app/actions/sluzby";
import { ActionForm, Submit } from "./forms";
import { SwitchRow } from "./SwitchRow";

/** Třídní služby u třídy (jen správce): zapnutí modulu. */
export function DutyClassForm({ classId, enabled }: { classId: number; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <ActionForm action={setDuty} resetOnSuccess={false}>
      <input type="hidden" name="class" value={classId} />
      <SwitchRow name="enabled" label="Třídní služby" hint="Každý týden slouží dva náhodně vylosovaní lidé, nikdo se neopakuje, dokud neodslouží všichni" checked={on} onChange={setOn} />
      <div><Submit>Uložit</Submit></div>
    </ActionForm>
  );
}
