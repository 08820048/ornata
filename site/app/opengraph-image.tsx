import { ImageResponse } from "next/og";

export const alt = "Ornata — the last notes app you'll download";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fcfcfb",
          color: "#191917",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg
            aria-hidden="true"
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
          >
            <rect width="64" height="64" rx="14" fill="#ffffff" />
            <path
              d="M11 12C7 17 11 19 17 18C28 16 47 14 51 19C55 24 43 27 31 30C20 33 11 36 12 40C14 45 29 42 41 43C52 44 57 49 53 55"
              stroke="#111111"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            Ornata
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.0,
              letterSpacing: -3.5,
              maxWidth: 1000,
            }}
          >
            <span style={{ color: "#191917" }}>The last notes app&nbsp;</span>
            <span style={{ color: "#9c9c95" }}>you&rsquo;ll download.</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#6a6a64", maxWidth: 860 }}>
            Local-first Markdown for macOS — with AssistantPi on your terms.
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#9c9c95",
          }}
        >
          <div style={{ display: "flex" }}>ornata.app</div>
          <div style={{ display: "flex" }}>Free · Apple Silicon · macOS 12+</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
