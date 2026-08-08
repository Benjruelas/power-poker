import { ImageResponse } from "next/og";

import {
  decodeParcelShareToken,
  formatAcres,
  formatAddressLines,
  mapboxSatelliteUrl,
} from "@/lib/share/parcelShare";

export const alt = "Parcel share preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

type Props = { params: Promise<{ token: string }> };

export default async function Image({ params }: Props) {
  const { token } = await params;
  const preview = await decodeParcelShareToken(decodeURIComponent(token));

  const addressLines = formatAddressLines(preview?.address || "");
  const parcelId = preview?.parcelId ? `Parcel ${preview.parcelId}` : "";
  const acres = formatAcres(preview?.acres ?? null);
  const metaLine = [parcelId, acres].filter(Boolean).join("  ·  ");

  const sat =
    preview && Number.isFinite(preview.lat) && Number.isFinite(preview.lng)
      ? mapboxSatelliteUrl(preview.lat, preview.lng, size.width, size.height, 17)
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
          // eslint-disable-next-line @next/next/no-img-element
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

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.52)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: 72,
            paddingRight: 72,
            width: "100%",
            height: "100%",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: 1,
              color: "#6ee7b7",
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            Power Poker
          </div>

          {addressLines.length > 0 ? (
            addressLines.map((line, i) => (
              <div
                key={`${i}-${line}`}
                style={{
                  display: "flex",
                  fontSize: i === 0 ? 64 : 40,
                  fontWeight: i === 0 ? 700 : 500,
                  lineHeight: 1.15,
                  marginBottom: i === addressLines.length - 1 ? 22 : 8,
                  maxWidth: 1050,
                }}
              >
                {line}
              </div>
            ))
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 56,
                fontWeight: 700,
                marginBottom: 22,
              }}
            >
              Shared parcel
            </div>
          )}

          {metaLine ? (
            <div
              style={{
                display: "flex",
                fontSize: 36,
                fontWeight: 500,
                color: "rgba(255,255,255,0.92)",
                marginBottom: 10,
              }}
            >
              {metaLine}
            </div>
          ) : null}

          {preview?.county || preview?.ownerName ? (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 400,
                color: "rgba(255,255,255,0.75)",
              }}
            >
              {[
                preview.county ? `${preview.county} County` : "",
                preview.ownerName || "",
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size }
  );
}
