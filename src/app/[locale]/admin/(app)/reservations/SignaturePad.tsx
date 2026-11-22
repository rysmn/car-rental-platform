"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Podpis palcem, na telefonie, przy aucie.
 *
 * Rysowane na `<canvas>`, wysyłane jako data URL w ukrytym polu tego samego
 * formularza co reszta protokołu. Jeden zapis, nie dwa: podpis bez protokołu
 * nie znaczy nic, a protokół zapisany osobno od podpisu potrafiłby zostać
 * z podpisem pod inną treścią.
 *
 * Trzy rzeczy, które na telefonie decydują, czy to w ogóle działa:
 *
 *   1. `touch-action: none` — bez tego pierwszy ruch palcem przewija stronę
 *      zamiast rysować, i płótno zbiera kropkę zamiast linii.
 *   2. Płótno rysuje w pikselach urządzenia (`devicePixelRatio`), inaczej
 *      linia na ekranie Retina jest rozmyta i po zapisie nieczytelna.
 *   3. Współrzędne liczone z `getBoundingClientRect`, nie z `offsetX` —
 *      `offsetX` w zdarzeniu dotykowym po prostu nie istnieje.
 */
export function SignaturePad({
  existingUrl,
  label,
  onChange,
}: {
  existingUrl: string | null;
  label: string;
  /** Data URL po każdym pociągnięciu; pusty łańcuch, gdy pole wyczyszczono. */
  onChange: (dataUrl: string) => void;
}) {
  const t = useTranslations("Admin.reservations.signature");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [replacing, setReplacing] = useState(!existingUrl);

  useEffect(() => {
    if (!replacing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, [replacing]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!drawn) setDrawn(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // Po każdym pociągnięciu, nie przy wysyłce: formularz jest wysyłany akcją
    // serwerową, a wyciąganie danych z płótna w `onSubmit` znaczyłoby czytanie
    // DOM-u w trakcie zdarzenia, które React już przetwarza.
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setDrawn(false);
    onChange("");
  };

  return (
    <section className="border-line bg-graphite/40 border p-5">
      <h2 className="label-tight text-ink-faint mb-4 text-[10px]">{label}</h2>

      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          {t("signedBy")}
        </span>
        <input
          name="signedByName"
          defaultValue=""
          placeholder={t("namePlaceholder")}
          className="border-line-strong bg-surface-1 text-ink h-12 w-full border px-3 text-base"
        />
      </label>

      {existingUrl && !replacing ? (
        <div className="mt-4">
          {/* Podpis leży za czytnikiem wymagającym sesji, więc zwykły <img> —
              `next/image` optymalizowałby prywatny plik do publicznego cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingUrl}
            alt={t("alt")}
            className="border-line max-h-32 border bg-white"
          />
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="label-tight border-line-strong text-ink hover:border-ink tap mt-3 inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
          >
            {t("signAgain")}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            data-testid="signature-canvas"
            className="border-line-strong h-40 w-full touch-none border bg-white"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={clear}
              className="label-tight border-line-strong text-ink-faint hover:border-ink hover:text-ink tap inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
            >
              {t("clear")}
            </button>
            <span className="text-ink-faint text-[11px]">
              {drawn ? t("willSave") : t("signHint")}
            </span>
          </div>
        </div>
      )}

    </section>
  );
}
