import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

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
          background: "#0b1220",
          color: "white",
          letterSpacing: "-0.03em",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1 }}>ROCA</div>
      </div>
    ),
    size,
  );
}

