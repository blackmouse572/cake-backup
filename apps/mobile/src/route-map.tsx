import { decodePolyline, type LatLng } from "@cage/shared";
import { Camera, GeoJSONSource, Layer, Map as MapView, Marker, type LngLatBounds } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "./i18n";
import { color } from "./theme";
import { Icon } from "./ui";

/**
 * The map on screen 01 (ADR 0004): MapLibre with the same OpenFreeMap style
 * as the circle's website. Tiles move to our own PMTiles in R2 before the
 * pilot; only this URL changes then.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Hanoi, for the moment before the phone knows where it is. */
const FALLBACK_CENTER: LatLng = { lat: 21.0285, lng: 105.8542 };

const CITY_ZOOM = 12;

const STREET_ZOOM = 14;

/** Room around the route, so the pins don't sit on the edge. */
const PADDING = { top: 56, right: 40, bottom: 32, left: 40 };

const CAMERA_MS = 600;

const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

function boundsOf(points: LatLng[]): LngLatBounds {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);

  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/**
 * Where the traveller is (route blue dot), where they're going (ink pin) and
 * the suggested route between them in route blue. Shows whatever it has.
 */
export function RouteMap({ here, to, polyline }: { here: LatLng | null; to: LatLng | null; polyline: string | null }) {
  const { t } = useTranslation();
  const line = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);
  const points = [...line, ...(here ? [here] : []), ...(to ? [to] : [])];
  const only = points.length === 1 ? points[0] : null;

  return (
    <View style={styles.map} accessible accessibilityLabel={t("plan.map")}>
      <MapView style={StyleSheet.absoluteFill} mapStyle={STYLE_URL} logo={false} compass={false} attributionPosition={{ bottom: 8, left: 8 }}>
        {points.length > 1 ? (
          <Camera bounds={boundsOf(points)} padding={PADDING} duration={CAMERA_MS} />
        ) : (
          <Camera
            center={lngLat(only ?? FALLBACK_CENTER)}
            zoom={only ? STREET_ZOOM : CITY_ZOOM}
            duration={CAMERA_MS}
          />
        )}
        {line.length > 1 ? (
          <GeoJSONSource
            id="route"
            data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map(lngLat) } }}
          >
            <Layer
              id="route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": color.blue, "line-width": 6 }}
            />
          </GeoJSONSource>
        ) : null}
        {here ? (
          <Marker id="here" lngLat={lngLat(here)}>
            <View style={styles.here} />
          </Marker>
        ) : null}
        {to ? (
          <Marker id="to" lngLat={lngLat(to)} anchor="bottom">
            <View style={styles.pin}>
              <Icon name="flag" size={18} tint={color.onFg} />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: "38%", backgroundColor: color.chip },
  here: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.blue, borderWidth: 3, borderColor: color.surface },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.fgPrimary,
    borderWidth: 3,
    borderColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
