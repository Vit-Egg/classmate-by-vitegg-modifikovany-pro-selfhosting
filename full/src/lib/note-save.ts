"use client";

import { createContext } from "react";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

/**
 * Jednotné ukládání poznámky: části, které se ukládají samostatně (hodnocení), hlásí svůj stav editoru a nechají se jím uložit,
 * takže stav nahoře („Neuloženo“, „Ukládám…“, „Uloženo“), tlačítko Uložit, Ctrl+S i odchod ze stránky platí pro celou poznámku najednou.
 */
export type NoteSave = {
  report: (status: SaveStatus) => void;
  register: (flush: (() => Promise<void>) | null) => void;
};

export const NoteSaveContext = createContext<NoteSave | null>(null);
