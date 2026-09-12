import { ImageResponse } from "next/og";

import {
  formatAddressLines,
  mapboxSatelliteUrl,
} from "@/lib/share/parcelShare";
import { resolveParcelSharePreview } from "@/lib/share/shareResolve";

export const alt = "Parcel share preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

/** Close-up of parcel center for SMS / Messages link previews. */
const CLOSE_UP_ZOOM = 18;

type Props = { params: Promise<{ token: string }> };

export default async function Image({ params }: Props) {
  const { token } = await params;
  const preview = await resolveParcelSharePreview(token);

  const ownerName = (preview?.ownerName || "").trim();
  const addressLines = formatAddressLines(preview?.address || "");
  const fallbackTitle =
    addressLines[0] || preview?.address?.trim() || "Shared parcel";

  const sat =
    preview && Number.isFinite(preview.lat) && Number.isFinite(preview.lng)
      ? mapboxSatelliteUrl(
          preview.lat,
          preview.lng,
          size.width,
          size.height,
          CLOSE_UP_ZOOM
        )
      : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "linear-gradient(135deg, #0b1220 0%, #132033 50%, #1a2740 100%)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {sat ? (
          <img
            src={sat}
            alt=""
            width={size.width}
            height={size.height}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}

        {/* Bottom scrim so owner + address stay readable over the close-up */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.88) 100%)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            paddingLeft: 64,
            paddingRight: 64,
            paddingBottom: 56,
            width: "100%",
            height: "100%",
            color: "#ffffff",
          }}
        >
          {ownerName ? (
            <div
              style={{
                display: "flex",
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1.15,
                marginBottom: addressLines.length > 0 ? 12 : 0,
                maxWidth: 1070,
              }}
            >
              {ownerName}
            </div>
          ) : null}

          {addressLines.length > 0 ? (
            addressLines.map((line, i) => (
              <div
                key={`${i}-${line}`}
                style={{
                  display: "flex",
                  fontSize: ownerName ? (i === 0 ? 36 : 30) : i === 0 ? 52 : 36,
                  fontWeight: ownerName ? 500 : i === 0 ? 700 : 500,
                  lineHeight: 1.2,
                  marginBottom: i === addressLines.length - 1 ? 0 : 6,
                  maxWidth: 1070,
                  color: ownerName ? "rgba(255,255,255,0.9)" : "#ffffff",
                }}
              >
                {line}
              </div>
            ))
          ) : ownerName ? null : (
            <div
              style={{
                display: "flex",
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1.15,
                maxWidth: 1070,
              }}
            >
              {fallbackTitle}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
