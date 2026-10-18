import { ImageResponse } from "next/og";

export const alt = "Updates — Ornata release archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  paper: "#f7f6f1",
  ink: "#161714",
  muted: "#797a72",
  faint: "#a2a39a",
  line: "rgba(22, 23, 20, 0.12)",
} as const;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: COLORS.paper,
          color: COLORS.ink,
          fontFamily: "serif",
          border: `1px solid ${COLORS.line}`,
        }}
      >
        <div
          style={{
            width: 190,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "54px 38px",
            borderRight: `1px solid ${COLORS.line}`,
            fontFamily: "monospace",
            color: COLORS.muted,
            textTransform: "uppercase",
            letterSpacing: 3,
          }}
        >
          <div style={{ display: "flex", fontSize: 15, lineHeight: 1.5 }}>
            Local-first
            <br />
            Markdown
            <br />
            Mac &amp; Windows
          </div>
          <div style={{ display: "flex", fontSize: 15 }}>ornata.app</div>
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "54px 64px",
            overflow: "hidden",
          }}
        >
          <svg
            aria-hidden="true"
            width="340"
            height="340"
            viewBox="0 0 64 64"
            fill="none"
            style={{
              position: "absolute",
              right: -25,
              top: 100,
              opacity: 0.07,
            }}
          >
            <path
              d="M11 12C7 17 11 19 17 18C28 16 47 14 51 19C55 24 43 27 31 30C20 33 11 36 12 40C14 45 29 42 41 43C52 44 57 49 53 55"
              stroke={COLORS.ink}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: "sans-serif",
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            <svg
              aria-hidden="true"
              width="38"
              height="38"
              viewBox="0 0 64 64"
              fill="none"
            >
              <path
                d="M11 12C7 17 11 19 17 18C28 16 47 14 51 19C55 24 43 27 31 30C20 33 11 36 12 40C14 45 29 42 41 43C52 44 57 49 53 55"
                stroke={COLORS.ink}
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ornata
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 86,
                lineHeight: 0.9,
                letterSpacing: -4,
              }}
            >
              <span>Every release,</span>
              <span>in plain terms.</span>
            </div>
            <div
              style={{
                display: "flex",
                maxWidth: 700,
                fontFamily: "sans-serif",
                fontSize: 23,
                lineHeight: 1.4,
                color: COLORS.muted,
              }}
            >
              What is new in Ornata — version by version, from math and
              diagrams to the assistant&apos;s latest tools.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "monospace",
              fontSize: 15,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: COLORS.faint,
            }}
          >
            <span>Release archive</span>
            <span>ornata.app/updates</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
