"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addDamagePhoto,
  deleteDamagePhoto,
  type DamageResult,
} from "./actions";
import type { DamagePhotoRecord } from "@/lib/admin/damage-options";

/**
 * Zdjęcia szkody — dowód, więc za sesją, nie w publicznym katalogu zdjęć.
 *
 * Pliki idą tam, gdzie faktury (`/api/admin/invoice/…`): ten sam czytnik
 * sprawdzający sesję, ta sama obrona przed wyjściem ze ścieżki, ten sam brak
 * zgadywania typu. Zdjęcie wgniecionego błotnika i skan faktury za jego
 * naprawę to ta sama klasa pliku — dowód w sprawie o pieniądze.
 */
export function PhotoManager({
  damageId,
  photos,
}: {
  damageId: string;
  photos: DamagePhotoRecord[];
}) {
  const t = useTranslations("Admin.damages");
  const [addState, add, adding] = useActionState<DamageResult | null, FormData>(
    addDamagePhoto,
    null,
  );
  const [delState, remove, removing] = useActionState<
    DamageResult | null,
    FormData
  >(deleteDamagePhoto, null);

  const error =
    (addState && !addState.ok && addState.error) ||
    (delState && !delState.ok && delState.error) ||
    null;

  return (
    <div>
      {photos.length > 0 && (
        <ul className="mb-5 grid gap-4 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="border-line border p-2">
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* Zdjęcie leży za czytnikiem z sesją — `next/image`
                    optymalizowałby prywatny plik do publicznej pamięci. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.note ?? t("photos.alt")}
                  className="h-32 w-full bg-white object-contain"
                />
              </a>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-ink-faint truncate text-xs">
                  {p.note ?? ""}
                </span>
                <form action={remove}>
                  <input type="hidden" name="photoId" value={p.id} />
                  <input type="hidden" name="damageId" value={damageId} />
                  <button
                    disabled={removing}
                    className="label-tight text-ink-faint hover:text-red text-[10px] transition-colors disabled:opacity-60"
                  >
                    {t("actions.delete")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="damageId" value={damageId} />
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("photos.file")}
          </span>
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="text-ink text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("photos.note")}
          </span>
          <input
            name="note"
            placeholder={t("photos.notePlaceholder")}
            className="border-line-strong bg-surface-1 text-ink h-11 w-full min-w-40 border px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={adding}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-5 text-xs transition-colors disabled:opacity-60"
        >
          {adding ? t("photos.uploading") : t("photos.add")}
        </button>
      </form>

      {error && <p className="text-red mt-3 text-xs">{error}</p>}
    </div>
  );
}
