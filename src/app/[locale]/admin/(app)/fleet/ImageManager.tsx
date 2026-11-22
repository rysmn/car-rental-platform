"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  uploadModelImages,
  removeModelImage,
  moveModelImage,
  type FormResult,
} from "./actions";

/**
 * The photo gallery for one car model.
 *
 * Every button writes straight through to the database — there is no "save"
 * step, because a gallery edit is a single unambiguous intent and pairing file
 * uploads with the details form below would mean re-uploading every photo each
 * time someone fixes a typo in the description.
 *
 * The first photo is the cover: it is what the fleet grid, the home showcase
 * and link previews use. Hence the explicit badge and the reorder arrows.
 */
export function ImageManager({
  modelId,
  images,
}: {
  modelId: string;
  images: string[];
}) {
  const t = useTranslations("Admin.fleet");
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, upload, uploading] = useActionState<
    FormResult | null,
    FormData
  >(async (_prev, formData) => {
    const res = await uploadModelImages(_prev, formData);
    if (res.ok && fileRef.current) fileRef.current.value = "";
    return res;
  }, null);
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  // One shared busy flag: these actions all rewrite the same array, so letting
  // two of them race would apply the second against a stale order.
  const busy = uploading || pending;

  const run = (fn: () => Promise<FormResult>) => {
    setRowError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setRowError(res.error);
    });
  };

  return (
    <section className="mt-14">
      <div className="mb-4">
        <h2 className="label text-ink text-xs">{t("photosHeading")}</h2>
        <p className="text-ink-faint text-xs">{t("photosIntro")}</p>
      </div>

      {images.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border px-5 py-6 text-center text-sm">
          {t("noPhotos")}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((url, i) => (
            <li key={url} className="border-line border">
              <div className="bg-graphite relative aspect-[3/2]">
                <Image
                  src={url}
                  alt={t("photoAlt", { n: i + 1 })}
                  fill
                  sizes="(min-width:1024px) 220px, 45vw"
                  className="object-cover"
                />
                {i === 0 && (
                  <span className="label-tight bg-red absolute top-2 left-2 px-2 py-1 text-[9px] text-white">
                    {t("cover")}
                  </span>
                )}
              </div>
              {/* `flex-wrap`: cztery cele po 44 px nie mieszczą się w komórce
                  siatki na telefonie. Trzy strzałki (←, →, ★) z odstępami to
                  140 px, „Usuń" pod `pointer: coarse` dostaje `min-width: 44px`
                  z reguły globalnej, a komórka `grid-cols-2` przy 390 px ma
                  171 px — czyli potrzeba ~208 px. Bez zawijania „Usuń"
                  wyjeżdżało poza komórkę i wypychało CAŁĄ stronę w bok
                  (zmierzone: +14 px przy 390 px, +49 px przy 320 px).

                  Zawijamy zamiast zmniejszać przyciski: to jest panel obsługiwany
                  jedną ręką przy aucie, więc 44 px zostaje, a drugi wiersz nie
                  kosztuje nic poza kilkoma pikselami wysokości. */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={busy || i === 0}
                    onClick={() =>
                      run(() => moveModelImage(modelId, url, "up"))
                    }
                    aria-label={t("moveEarlier")}
                    className="border-line-strong text-silver hover:text-ink h-11 w-11 border text-xs transition-colors disabled:opacity-30 pointer-fine:h-7 pointer-fine:w-7"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={busy || i === images.length - 1}
                    onClick={() =>
                      run(() => moveModelImage(modelId, url, "down"))
                    }
                    aria-label={t("moveLater")}
                    className="border-line-strong text-silver hover:text-ink h-11 w-11 border text-xs transition-colors disabled:opacity-30 pointer-fine:h-7 pointer-fine:w-7"
                  >
                    →
                  </button>
                  {/* One step to the front, because "make this the cover" was
                      three presses and three round trips for the fourth photo
                      — on a phone, which is where this panel is used. */}
                  <button
                    type="button"
                    disabled={busy || i === 0}
                    onClick={() =>
                      run(() => moveModelImage(modelId, url, "cover"))
                    }
                    aria-label={t("setCover")}
                    title={t("setCover")}
                    className="border-line-strong text-silver hover:text-ink h-11 w-11 border text-xs transition-colors disabled:opacity-30 pointer-fine:h-7 pointer-fine:w-7"
                  >
                    ★
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(t("deletePhotoConfirm"))) return;
                    run(() => removeModelImage(modelId, url));
                  }}
                  className="label-tight text-red tap text-[10px] transition-opacity hover:opacity-70 disabled:opacity-30"
                >
                  {t("remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rowError && <p className="text-red mt-3 text-xs">{rowError}</p>}

      <form action={upload} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="modelId" value={modelId} />
        <input
          ref={fileRef}
          type="file"
          name="images"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          className="text-silver file:border-line-strong file:label-tight file:bg-surface-1 file:text-ink w-full min-w-0 text-sm file:mr-3 file:border file:px-4 file:py-2 file:text-[10px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="label bg-red hover:bg-red-hover inline-flex h-10 items-center px-6 text-xs text-white transition-colors disabled:opacity-50"
        >
          {uploading ? t("uploading") : t("addPhotos")}
        </button>
      </form>

      {state && !state.ok && (
        <p className="text-red mt-3 text-xs">{state.error}</p>
      )}
    </section>
  );
}
