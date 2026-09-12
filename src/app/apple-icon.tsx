import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS “Add to Home Screen” / PWA. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <div
          style={{
            width: 124,
            height: 124,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            borderRadius: 28,
            color: "#0a0a0a",
            fontSize: 54,
            fontWeight: 800,
            letterSpacing: -3,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          PP
        </div>
      </div>
    ),
    { ...size }
  );
}
