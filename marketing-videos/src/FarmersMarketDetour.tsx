import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CartoonBusIcon } from "./CartoonBusIcon";

const colors = {
  navy: "#0B214A",
  blue: "#1E64C8",
  lightBlue: "#EAF3FF",
  purple: "#8B5CF6",
  red: "#EF4444",
  green: "#10B981",
  yellow: "#FBBF24",
  ink: "#122033",
  muted: "#64748B",
  white: "#FFFFFF",
  road: "#D7DEE8",
};

type Point = { x: number; y: number };

const normalRoute: Point[] = [
  { x: 710, y: 210 },
  { x: 710, y: 430 },
  { x: 710, y: 690 },
  { x: 710, y: 860 },
];

const skippedSegment: Point[] = [
  { x: 710, y: 430 },
  { x: 710, y: 690 },
];

const detourPath: Point[] = [
  { x: 710, y: 430 },
  { x: 545, y: 430 },
  { x: 545, y: 690 },
  { x: 710, y: 690 },
];

const busPath: Point[] = [
  { x: 710, y: 210 },
  { x: 710, y: 410 },
  { x: 545, y: 430 },
  { x: 545, y: 690 },
  { x: 710, y: 690 },
  { x: 710, y: 805 },
];

const toPath = (points: Point[]) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const pathLength = (points: Point[]) =>
  points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);

const pointAlong = (points: Point[], progress: number): Point => {
  const target = pathLength(points) * Math.max(0, Math.min(1, progress));
  let travelled = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const segment = distance(start, end);
    if (travelled + segment >= target) {
      const local = segment === 0 ? 0 : (target - travelled) / segment;
      return {
        x: start.x + (end.x - start.x) * local,
        y: start.y + (end.y - start.y) * local,
      };
    }
    travelled += segment;
  }

  return points[points.length - 1];
};

const fade = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const RoadLabel = ({ x, y, children, rotate = 0 }: { x: number; y: number; children: React.ReactNode; rotate?: number }) => (
  <text
    x={x}
    y={y}
    transform={`rotate(${rotate} ${x} ${y})`}
    fill={colors.muted}
    fontSize={24}
    fontWeight={700}
    textAnchor="middle"
    style={{ letterSpacing: 1.2 }}
  >
    {children}
  </text>
);

const MapScene = ({ frame }: { frame: number }) => {
  const normalLength = pathLength(normalRoute);
  const skippedLength = pathLength(skippedSegment);
  const detourLength = pathLength(detourPath);

  const routeProgress = fade(frame, 35, 70);
  const skippedProgress = fade(frame, 175, 45);
  const detourProgress = fade(frame, 245, 75);
  const busProgress = interpolate(frame, [80, 430], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const bus = pointAlong(busPath, busProgress);

  const pulse = interpolate(Math.sin(frame / 7), [-1, 1], [0.65, 1]);

  return (
    <div style={{ position: "absolute", left: 90, top: 185, width: 1000, height: 870, transform: "scale(0.86)", transformOrigin: "top left" }}>
      <svg width="1000" height="870" viewBox="0 0 1000 870">
        <rect x="0" y="0" width="1000" height="870" rx="36" fill="#F8FBFF" />
        <path d="M165 180 L900 180" stroke={colors.road} strokeWidth="24" strokeLinecap="round" />
        <path d="M165 430 L900 430" stroke={colors.road} strokeWidth="30" strokeLinecap="round" />
        <path d="M165 690 L900 690" stroke={colors.road} strokeWidth="30" strokeLinecap="round" />
        <path d="M545 120 L545 800" stroke={colors.road} strokeWidth="28" strokeLinecap="round" />
        <path d="M710 120 L710 800" stroke={colors.road} strokeWidth="32" strokeLinecap="round" />
        <path d="M300 120 L300 800" stroke="#E6EBF2" strokeWidth="22" strokeLinecap="round" />
        <path d="M165 820 L900 820" stroke="#E6EBF2" strokeWidth="22" strokeLinecap="round" />

        <RoadLabel x={860} y={405}>Collier St</RoadLabel>
        <RoadLabel x={860} y={665}>McDonald St</RoadLabel>
        <RoadLabel x={742} y={130} rotate={90}>Mulcaster St</RoadLabel>
        <RoadLabel x={578} y={130} rotate={90}>Owen St</RoadLabel>
        <RoadLabel x={870} y={180}>Dunlop St E</RoadLabel>
        <RoadLabel x={870} y={820}>Worsley St</RoadLabel>

        <path
          d={toPath(normalRoute)}
          stroke={colors.blue}
          strokeWidth="18"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={normalLength}
          strokeDashoffset={normalLength * (1 - routeProgress)}
        />

        <path
          d={toPath(skippedSegment)}
          stroke={colors.red}
          strokeWidth="24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24 22"
          opacity={skippedProgress}
        />

        <path
          d={toPath(detourPath)}
          stroke={colors.purple}
          strokeWidth="22"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={detourLength}
          strokeDashoffset={detourLength * (1 - detourProgress)}
          opacity={fade(frame, 230, 25)}
        />

        {[detourPath[0], detourPath[detourPath.length - 1]].map((p, index) => (
          <g key={index} opacity={fade(frame, 250 + index * 16, 20)}>
            <circle cx={p.x} cy={p.y} r={22} fill={colors.white} stroke={colors.purple} strokeWidth="8" />
            <circle cx={p.x} cy={p.y} r={8} fill={colors.purple} />
          </g>
        ))}

        <g transform={`translate(${bus.x} ${bus.y})`} opacity={fade(frame, 80, 20)}>
          <circle r={48 * pulse} fill={colors.green} opacity="0.14" />
          <CartoonBusIcon routeLabel="11" />
        </g>
      </svg>
    </div>
  );
};

const PhoneCard = ({ frame }: { frame: number }) => {
  const y = interpolate(fade(frame, 330, 35), [0, 1], [60, 0]);
  const opacity = fade(frame, 330, 35);
  const details = fade(frame, 430, 35);

  return (
    <div
      style={{
        position: "absolute",
        right: 125,
        top: 130 + y,
        width: 560,
        height: 815,
        borderRadius: 62,
        background: "#0A1325",
        padding: 20,
        boxShadow: "0 34px 90px rgba(11, 33, 74, 0.34)",
        opacity,
      }}
    >
      <div style={{ height: "100%", borderRadius: 44, background: colors.white, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 13,
            left: "50%",
            transform: "translateX(-50%)",
            width: 146,
            height: 32,
            borderRadius: 999,
            background: "#0A1325",
            zIndex: 3,
          }}
        />
        <div style={{ height: 132, background: colors.navy, color: colors.white, padding: "50px 34px 16px", fontSize: 30, fontWeight: 900 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 20, opacity: 0.9, marginBottom: 16 }}>
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          MyBarrie Transit
        </div>
        <div style={{ padding: 30 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ color: colors.muted, fontSize: 20, fontWeight: 800 }}>Live service alert</div>
              <div style={{ color: colors.ink, fontSize: 28, fontWeight: 950 }}>Downtown Barrie</div>
            </div>
            <div style={{ width: 54, height: 54, borderRadius: 18, background: colors.lightBlue, color: colors.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 950, fontSize: 20 }}>
              11
            </div>
          </div>
          <div style={{ borderRadius: 28, background: "#FFF1F2", border: `3px solid ${colors.red}`, padding: 20 }}>
            <div style={{ color: colors.red, fontSize: 25, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.8 }}>
              Detour detected
            </div>
            <div style={{ color: colors.ink, fontSize: 36, fontWeight: 900, marginTop: 10, lineHeight: 1.05 }}>
              Route 11 is currently on detour
            </div>
            <div style={{ color: colors.muted, fontSize: 23, marginTop: 12, lineHeight: 1.22 }}>
              Farmers Market closure near Mulcaster Street
            </div>
          </div>

          <div style={{ opacity: details, transform: `translateY(${(1 - details) * 24}px)` }}>
            <div style={{ marginTop: 20, fontSize: 26, fontWeight: 900, color: colors.ink }}>What riders see</div>
            {[
              [colors.red, "Skipped route segment highlighted"],
              [colors.purple, "Likely detour path shown on the map"],
              [colors.green, "Live bus movement confirms the change"],
            ].map(([color, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 13 }}>
                <div style={{ width: 22, height: 22, borderRadius: 999, background: color }} />
                <div style={{ fontSize: 22, color: colors.ink, fontWeight: 700 }}>{text}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", width: 160, height: 6, borderRadius: 999, background: "#0A1325", opacity: 0.22 }} />
      </div>
    </div>
  );
};

const FarmersMarketEventPopup = ({ frame }: { frame: number }) => {
  const enter = fade(frame, 105, 24);
  const exit = interpolate(frame, [245, 285], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.7, 0, 0.84, 0),
  });
  const opacity = enter * exit;
  const scale = interpolate(enter, [0, 1], [0.88, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const y = interpolate(enter, [0, 1], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 740,
        top: 276 + y,
        width: 430,
        borderRadius: 30,
        background: colors.white,
        border: `4px solid ${colors.yellow}`,
        boxShadow: "0 28px 70px rgba(11, 33, 74, 0.22)",
        padding: 26,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 18,
            background: "#FEF3C7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
          }}
        >
          <span style={{ color: colors.navy, fontSize: 22, fontWeight: 950 }}>FM</span>
        </div>
        <div>
          <div style={{ color: colors.green, fontSize: 22, fontWeight: 950, textTransform: "uppercase", letterSpacing: 1.6 }}>
            Event started
          </div>
          <div style={{ color: colors.ink, fontSize: 31, fontWeight: 950, marginTop: 4 }}>Farmers Market is open</div>
        </div>
      </div>
      <div style={{ color: colors.muted, fontSize: 23, fontWeight: 700, lineHeight: 1.25, marginTop: 18 }}>
        Mulcaster Street closure begins. Route 11 buses start using the detour.
      </div>
      <div
        style={{
          marginTop: 20,
          borderRadius: 999,
          background: "#FFF1F2",
          color: colors.red,
          fontSize: 22,
          fontWeight: 900,
          padding: "12px 18px",
          display: "inline-block",
        }}
      >
        Detour now active
      </div>
    </div>
  );
};

const Headline = ({ frame }: { frame: number }) => {
  const firstOpacity = interpolate(frame, [0, 40, 175, 205], [1, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secondOpacity = interpolate(frame, [205, 245, 520, 560], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const finalOpacity = fade(frame, 570, 40);

  return (
    <div style={{ position: "absolute", left: 120, top: 46, width: 1060 }}>
      <div style={{ position: "absolute", opacity: firstOpacity }}>
        <div style={{ color: colors.navy, fontSize: 72, fontWeight: 950, lineHeight: 0.95 }}>When Route 11 detours downtown</div>
        <div style={{ color: colors.muted, fontSize: 32, fontWeight: 700, marginTop: 16 }}>BTTP turns live bus movement into rider-facing map guidance.</div>
      </div>
      <div style={{ position: "absolute", opacity: secondOpacity }}>
        <div style={{ color: colors.navy, fontSize: 72, fontWeight: 950, lineHeight: 0.95 }}>The app shows the problem clearly</div>
        <div style={{ color: colors.muted, fontSize: 32, fontWeight: 700, marginTop: 16 }}>Skipped segment. Likely detour path. Alert banner. No guessing.</div>
      </div>
      <div style={{ position: "absolute", opacity: finalOpacity }}>
        <div style={{ color: colors.navy, fontSize: 72, fontWeight: 950, lineHeight: 0.95 }}>Know before you go</div>
        <div style={{ color: colors.muted, fontSize: 32, fontWeight: 700, marginTop: 16 }}>Automatic detour awareness for Barrie riders.</div>
      </div>
    </div>
  );
};

const EndCard = ({ frame }: { frame: number }) => {
  const opacity = fade(frame, 675, 40);
  const scale = spring({ frame: frame - 680, fps: 30, config: { damping: 18, stiffness: 90 } });

  return (
    <AbsoluteFill
      style={{
        background: colors.navy,
        opacity,
        alignItems: "center",
        justifyContent: "center",
        color: colors.white,
      }}
    >
      <div style={{ transform: `scale(${0.92 + scale * 0.08})`, textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: colors.yellow, marginBottom: 22 }}>MyBarrie Transit</div>
        <div style={{ fontSize: 88, fontWeight: 950, lineHeight: 0.95, maxWidth: 1280 }}>Real-time detour awareness for riders</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: "#CFE2FF", marginTop: 34 }}>Detected automatically. Shown clearly. Updated live.</div>
      </div>
    </AbsoluteFill>
  );
};

export const FarmersMarketDetour = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ width, height, background: `linear-gradient(135deg, ${colors.lightBlue}, #FFFFFF)`, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <MapScene frame={frame} />
      <Headline frame={frame} />
      <FarmersMarketEventPopup frame={frame} />
      <PhoneCard frame={frame} />
      <div style={{ position: "absolute", left: 132, bottom: 60, display: "flex", gap: 18, alignItems: "center", color: colors.muted, fontSize: 25, fontWeight: 800 }}>
        <span style={{ color: colors.blue }}>● Regular route</span>
        <span style={{ color: colors.red }}>● Skipped segment</span>
        <span style={{ color: colors.purple }}>● Likely detour path</span>
      </div>
      <EndCard frame={frame} />
    </AbsoluteFill>
  );
};



