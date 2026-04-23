import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0b1220 0%, #111827 60%, #0b1220 100%)",
          color: "white",
          letterSpacing: "-0.03em",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 64,
            borderRadius: 56,
            border: "2px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1 }}>ROCA</div>
          <div style={{ fontSize: 40, fontWeight: 600, opacity: 0.92, marginTop: 12 }}>Lab</div>
        </div>
      </div>
    ),
    size,
  );
}

