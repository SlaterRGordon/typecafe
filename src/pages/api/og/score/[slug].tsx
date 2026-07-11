import { ImageResponse } from "next/og";
import type { NextApiRequest, NextApiResponse } from "next";

import { TestModes, TestSubModes } from "~/components/typer/types";
import { loadOgFonts } from "~/server/og/fonts";
import { getShareForOg, type OgScoreData, type OgProgressData } from "~/server/og/scoreData";

export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
const SHARE_DOMAIN = "typecafe.app";

// Fixed brand palette. The server has no viewer theme, and consistent-looking
// unfurls are better brand assets than per-user colors.
const BRAND = {
  bg: "#1b1d29",
  text: "#f8f8f2",
  textMuted: "rgba(248,248,242,0.58)",
  textSubtle: "rgba(248,248,242,0.42)",
  primary: "#ff79c6",
};

const modeLabels = ["Timed", "Practice", "N-grams", "Relaxed"];
const subModeLabels = ["Timed", "Words"];

function formatNumber(value: number, digits = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatModeText(data: Pick<OgScoreData, "mode" | "subMode" | "language">) {
  if (data.mode === TestModes.normal) {
    return `${subModeLabels[data.subMode] ?? subModeLabels[TestSubModes.timed]} / ${data.language}`;
  }

  return `${modeLabels[data.mode] ?? "Timed"} / ${subModeLabels[data.subMode] ?? subModeLabels[TestSubModes.timed]} / ${data.language}`;
}

function sparklineDataUri(samples: OgScoreData["wpmSamples"], rawWpm: number) {
  const width = 1088;
  const height = 150;
  const points = (samples.length > 0 ? samples : [{ elapsedSeconds: 0, wpm: rawWpm }, { elapsedSeconds: 1, wpm: rawWpm }]);
  const maxWpm = Math.max(...points.map((p) => p.wpm), rawWpm, 1);
  const maxSecond = Math.max(...points.map((p) => p.elapsedSeconds), 1);
  const coords = points.map((p) => ({
    x: (p.elapsedSeconds / maxSecond) * width,
    y: height - (p.wpm / maxWpm) * (height - 8) - 4,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${areaPath}" fill="${BRAND.primary}" fill-opacity="0.14"/><path d="${linePath}" fill="none" stroke="${BRAND.primary}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function Stat(props: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: BRAND.textMuted }}>{props.label}</div>
      <div style={{ fontSize: 46, fontWeight: 700, color: BRAND.text, marginTop: 4 }}>{props.value}</div>
    </div>
  );
}

function ScoreCard(props: { data: OgScoreData; brag?: string }) {
  const { data, brag } = props;
  const modeText = formatModeText(data);
  const username = data.username ? `@${data.username}` : "Guest";

  return (
    <div
      style={{
        width: SHARE_IMAGE_WIDTH,
        height: SHARE_IMAGE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
        backgroundColor: BRAND.bg,
        color: BRAND.text,
        fontFamily: "Roboto Mono",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: BRAND.text }}>TypeCafe</div>
          <div style={{ fontSize: 20, color: BRAND.textMuted, marginTop: 4 }}>{SHARE_DOMAIN}</div>
          {brag ?
            <div style={{ display: "flex", marginTop: 44 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.primary, backgroundColor: "rgba(255,121,198,0.14)", borderRadius: 9999, padding: "8px 20px" }}>{brag}</div>
            </div>
            : null}
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: BRAND.primary, marginTop: brag ? 16 : 48 }}>WORDS PER MINUTE</div>
          <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: -6, color: BRAND.primary }}>{formatNumber(data.netWpm, 1)}</div>
          {typeof data.avgDelta === "number" ?
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: data.avgDelta >= 0 ? "#50fa7b" : "#ff5555", marginTop: 12 }}>
              {`${formatNumber(Math.abs(data.avgDelta), 1)} WPM ${data.avgDelta >= 0 ? "over" : "under"} their 30-day average`}
            </div>
            : null}
          <div style={{ fontSize: 20, color: BRAND.textMuted, marginTop: 12 }}>{`${modeText} / ${formatDate(data.createdAt)}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: 24 }}>
          {data.dailyChallenge ?
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.primary, backgroundColor: "rgba(255,121,198,0.14)", border: "1px solid rgba(255,121,198,0.45)", borderRadius: 9999, padding: "8px 18px" }}>Daily Challenge</div>
            </div>
            : null}
          <Stat label="ACCURACY" value={`${formatNumber(data.accuracy, 1)}%`} />
          <Stat label="RAW WPM" value={formatNumber(data.rawWpm, 1)} />
          <Stat label="DURATION" value={`${Math.round(data.durationSeconds)}s`} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sparklineDataUri(data.wpmSamples, data.rawWpm)} width={1088} height={150} alt="" />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text, maxWidth: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{username}</div>
        </div>
      </div>
    </div>
  );
}

// The "+18 WPM in 60 days" unfurl — leads with the delta, not an absolute.
function ProgressCard(props: { data: OgProgressData }) {
  const { data } = props;
  const positive = data.deltaWpm >= 0;
  const sign = positive ? "+" : "";
  const username = data.username ? `@${data.username}` : "A TypeCafe typist";
  const samples = data.points.map((p) => ({ elapsedSeconds: p.t, wpm: p.wpm }));
  const maxWpm = Math.max(...data.points.map((p) => p.wpm), 1);

  return (
    <div
      style={{
        width: SHARE_IMAGE_WIDTH,
        height: SHARE_IMAGE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
        backgroundColor: BRAND.bg,
        color: BRAND.text,
        fontFamily: "Roboto Mono",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: BRAND.text }}>TypeCafe</div>
        <div style={{ fontSize: 20, color: BRAND.textMuted, marginTop: 4 }}>{SHARE_DOMAIN}</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: BRAND.primary, marginTop: 44 }}>WORDS PER MINUTE GAINED</div>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: -6, color: positive ? "#50fa7b" : "#ff5555" }}>{`${sign}${formatNumber(data.deltaWpm, 1)}`}</div>
        </div>
        <div style={{ fontSize: 30, color: BRAND.text, marginTop: 16 }}>{`in ${data.periodLabel}`}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sparklineDataUri(samples, maxWpm)} width={1088} height={150} alt="" />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text, maxWidth: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{username}</div>
        </div>
      </div>
    </div>
  );
}

function FallbackCard() {
  return (
    <div
      style={{
        width: SHARE_IMAGE_WIDTH,
        height: SHARE_IMAGE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        backgroundColor: BRAND.bg,
        color: BRAND.text,
        fontFamily: "Roboto Mono",
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 700 }}>TypeCafe</div>
      <div style={{ fontSize: 30, color: BRAND.primary, marginTop: 12 }}>Find what slows you down. Drill it.</div>
      <div style={{ fontSize: 24, color: BRAND.textMuted, marginTop: 24 }}>{SHARE_DOMAIN}</div>
    </div>
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = typeof req.query.slug === "string" ? req.query.slug : "";

  try {
    // A data-fetch failure (e.g. DB unavailable) still yields a valid brand image
    // rather than a broken unfurl.
    let data: Awaited<ReturnType<typeof getShareForOg>> = null;
    try {
      data = slug ? await getShareForOg(slug) : null;
    } catch {
      data = null;
    }
    const fonts = await loadOgFonts();

    const card = !data
      ? <FallbackCard />
      : data.kind === "progress"
        ? <ProgressCard data={data} />
        : <ScoreCard data={data} brag={data.brag ?? undefined} />;
    const image = new ImageResponse(card, {
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_IMAGE_HEIGHT,
      fonts: fonts.map((font) => ({ name: font.name, data: font.data, weight: font.weight, style: font.style })),
    });

    const buffer = Buffer.from(await image.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(buffer);
  } catch (err) {
    console.error("OG render failed:", err);
    res.status(500).json({ error: "Could not render score image." });
  }
}
