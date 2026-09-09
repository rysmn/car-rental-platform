import { CarPhoto } from "./CarPhoto";
import type { FleetCar } from "@/lib/fleet/types";

/**
 * Car photo, or a branded dark placeholder when no photo exists yet. The image
 * bleeds to the container edges (no frame) per the design direction.
 *
 * Które zdjęcie jest tym pierwszym, rozstrzyga `CarPhoto` — w ciemnym motywie
 * nr 1, w jasnym nr 2. Ten komponent pyta o KADR ZEROWY i nie wie o motywie nic
 * ponad to; decyzja mieszka w jednym miejscu, nie w każdym wywołaniu.
 */
export function CarMedia({
  car,
  sizes,
  priority,
}: {
  car: Pick<FleetCar, "images" | "brand" | "model">;
  sizes: string;
  priority?: boolean;
}) {
  if (car.images.length > 0) {
    return (
      <CarPhoto
        images={car.images}
        alt={`${car.brand} ${car.model}`}
        sizes={sizes}
        priority={priority}
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_50%_0%,#181818,#000)]">
      <span className="font-heading text-ink/10 text-3xl font-bold tracking-[0.12em] uppercase">
        {car.brand}
      </span>
    </div>
  );
}
