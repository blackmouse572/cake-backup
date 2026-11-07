import { encodePolyline, metresBetween, type Place } from "@cage/shared";
import { FIXED_MAPS } from "../constants";
import type { MapsProvider } from "../types";

/** A few real places in Hanoi and Đà Nẵng, so search works without a Goong key. */
const PLACES: Place[] = [
  { id: "fixed-my-dinh", name: "Bến xe Mỹ Đình", address: "20 Phạm Hùng, Nam Từ Liêm, Hà Nội", lat: 21.0285, lng: 105.7782 },
  { id: "fixed-giap-bat", name: "Bến xe Giáp Bát", address: "Giải Phóng, Hoàng Mai, Hà Nội", lat: 20.9806, lng: 105.8414 },
  { id: "fixed-ga-ha-noi", name: "Ga Hà Nội", address: "120 Lê Duẩn, Hoàn Kiếm, Hà Nội", lat: 21.0245, lng: 105.8412 },
  { id: "fixed-dai-co-viet", name: "1 Đại Cồ Việt", address: "Hai Bà Trưng, Hà Nội", lat: 21.0072, lng: 105.843 },
  { id: "fixed-ga-da-nang", name: "Ga Đà Nẵng", address: "791 Hải Phòng, Thanh Khê, Đà Nẵng", lat: 16.0716, lng: 108.2097 },
];

/** Lower case without diacritics, so "ben xe" finds "Bến xe". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/**
 * For `wrangler dev` and tests (`MAPS_PROVIDER=fixed`): searches a short
 * list of places and draws routes as straight lines. Calls nobody.
 */
export const fixedMaps: MapsProvider = {
  async suggest(query) {
    const words = fold(query).split(/\s+/).filter(Boolean);

    return PLACES.flatMap(({ id, name, address }) =>
      words.every((w) => fold(`${name} ${address}`).includes(w)) ? [{ id, name, address }] : [],
    );
  },

  async place(id) {
    return PLACES.find((p) => p.id === id) ?? null;
  },

  async route({ from, to, mode }) {
    const distanceM = Math.round(metresBetween(from, to) * FIXED_MAPS.detour);

    return {
      distanceM,
      durationS: Math.round(distanceM / FIXED_MAPS.speedMps[mode]),
      polyline: encodePolyline([from, to]),
    };
  },
};
