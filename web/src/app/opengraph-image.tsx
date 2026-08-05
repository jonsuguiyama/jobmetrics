import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const scoreBars = [
  { width: 88, color: "#00ffa3" },
  { width: 64, color: "#00ffa3" },
  { width: 46, color: "#ffb020" },
  { width: 28, color: "#ff5c5c" },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0d0b",
          color: "#eaf2ee",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#00ffa3",
              boxShadow: "0 0 20px 8px #00ffa3",
            }}
          />
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#8b9891",
              letterSpacing: 2,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            jobmetrics
          </div>
        </div>
        <div
          style={{
            fontSize: 60,
            fontWeight: 700,
            marginTop: 24,
            maxWidth: 820,
            lineHeight: 1.15,
            display: "flex",
          }}
        >
          Match your resume against real job postings, live.
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            width: 420,
            marginTop: 56,
          }}
        >
          {scoreBars.map((bar, i) => (
            <div
              key={i}
              style={{
                width: `${bar.width}%`,
                height: 14,
                background: bar.color,
                borderRadius: 999,
                display: "flex",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
