"use client";

import { useEffect, useLayoutEffect } from "react";
import { THEME_KEY } from "./ThemeToggle";
import { CURRENCY_KEY } from "@/components/currency/CurrencySwitcher";

/**
 * Przywraca wybór motywu i waluty na `<html>` po KAŻDYM montażu drzewa.
 *
 * ## Usterka, którą to zamyka (02.09.2026)
 *
 * Motyw i waluta żyją jako atrybuty na `<html>`, ustawiane przed pierwszym
 * malowaniem przez `THEME_INIT_SCRIPT` i `CURRENCY_INIT_SCRIPT`. Oba skrypty
 * są `<script>` w `<head>`, więc uruchamiają się **wyłącznie przy pełnym
 * wczytaniu dokumentu**.
 *
 * Zmiana języka pełnym wczytaniem nie jest. Next przechodzi wtedy na inny
 * segment `[locale]`, ale ten sam dokument — a React łata `<html>` wartościami
 * z JSX układu, czyli `data-theme="dark"` i `data-currency="pln"`. Zmierzone:
 * klient wybiera euro i jasny motyw, przełącza PL → EN i dostaje złotówki
 * w ciemnym motywie. `localStorage` przez cały czas trzyma prawdę — nikt jej
 * tylko nie czyta, bo skrypt z `<head>` już się nie uruchomi.
 *
 * ## Dlaczego efekt, a nie kolejny skrypt
 *
 * Skrypt w `<head>` nie ma jak zadziałać przy nawigacji miękkiej; efekt
 * komponentu owszem, bo React montuje go ponownie razem z układem. Warstwowo
 * jest to więc uzupełnienie, a nie zamiennik: skrypt załatwia pierwsze
 * malowanie (zero mignięcia), ten efekt — każde następne przejście.
 *
 * `useLayoutEffect` na kliencie, a nie `useEffect`: waluta rządzi widocznością
 * dwóch wersji każdej ceny przez CSS, więc atrybut poprawiony po odmalowaniu
 * dałby jedną klatkę złotówek na stronie ustawionej na euro. Na serwerze
 * `useLayoutEffect` ostrzega, więc tam używamy `useEffect` — pusty przebieg,
 * bo `window` i tak nie istnieje.
 *
 * Nic tu nie ZAPISUJE. Zapisuje wyłącznie kliknięcie w przełącznik; ten
 * komponent tylko przywraca to, co klient już wybrał.
 */
const useEfektUkladu =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function PreferencjeHtml() {
  useEfektUkladu(() => {
    const html = document.documentElement;
    try {
      const motyw = localStorage.getItem(THEME_KEY);
      if (motyw === "light" || motyw === "dark") {
        if (html.getAttribute("data-theme") !== motyw) {
          html.setAttribute("data-theme", motyw);
        }
      }
      const waluta = localStorage.getItem(CURRENCY_KEY);
      const docelowa = waluta === "eur" ? "eur" : "pln";
      if (html.getAttribute("data-currency") !== docelowa) {
        html.setAttribute("data-currency", docelowa);
      }
    } catch {
      /* prywatne okno albo wyłączony magazyn — zostają wartości domyślne */
    }
  });

  return null;
}
