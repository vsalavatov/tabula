import {Box, Paper, Typography, useMediaQuery, useTheme} from "@mui/material";
import {useCallback, useLayoutEffect, useRef, useState} from "react";
import {CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis} from "recharts";
import type {BalanceDay, Unit} from "./bridge/types";

const millisecondsPerDay = 86_400_000;
const minimumBalanceAxisWidth = 60;
const balanceTickMargin = 6;
const balanceTickSize = 6;

function calendarDay(date: string) {
  return Date.parse(date) / millisecondsPerDay;
}

const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

export type BalanceChartMode = "line" | "candles";

interface CandleShapeProps {
  cx: number;
  payload: BalanceDay & { day: number };
  xAxis: { scale: (day: number) => number };
  yAxis: { scale: (balance: number) => number };
}

function BalanceAxisTick({ x, y, payload, className, tickFormatter, onMeasure }: {
  x?: number;
  y?: number;
  payload?: { value: number };
  className?: string;
  tickFormatter?: (value: number) => string;
  onMeasure: (element: SVGTextElement, width: number) => void;
}) {
  const ref = useRef<SVGTextElement>(null);
  const label = payload ? (tickFormatter?.(payload.value) ?? String(payload.value)) : "";

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    onMeasure(element, element.getComputedTextLength());
    return () => onMeasure(element, 0);
  }, [label, onMeasure]);

  return (
    <text ref={ref} className={className} x={x} y={y} textAnchor="end" dominantBaseline="central" fontSize={12} fill="currentColor">
      {label}
    </text>
  );
}

export function BalanceChart({ days, unit, mode }: { days: BalanceDay[]; unit?: Unit; mode: BalanceChartMode }) {
  const theme = useTheme();
  const touchInput = useMediaQuery("(hover: none)");
  const tickWidths = useRef(new Map<SVGTextElement, number>());
  const [balanceAxisWidth, setBalanceAxisWidth] = useState(minimumBalanceAxisWidth);
  const measureBalanceTick = useCallback((element: SVGTextElement, width: number) => {
    if (width === 0) tickWidths.current.delete(element);
    else tickWidths.current.set(element, width);

    const labelWidth = Math.ceil(Math.max(0, ...tickWidths.current.values()));
    setBalanceAxisWidth(Math.max(minimumBalanceAxisWidth, labelWidth + balanceTickSize + balanceTickMargin + 4));
  }, []);
  // An ISO local date is plotted as a calendar day, so daylight saving changes don't change its width.
  const points = days.map((point) => ({ ...point, day: calendarDay(point.date) }));
  const first = points[0];
  const last = points[points.length - 1];
  const candles = points.filter((point) => point.hasActivity);
  const isCandles = mode === "candles";
  const fractionDigits = Math.min(20, Math.max(0, unit?.mantissaLength ?? 2));
  const formatBalance = new Intl.NumberFormat(undefined, { maximumFractionDigits: fractionDigits });
  const formatChange = new Intl.NumberFormat(undefined, { maximumFractionDigits: fractionDigits, signDisplay: "exceptZero" });
  const formatAmount = (amount: number) => `${formatBalance.format(amount)}${unit ? ` ${unit.symbol}` : ""}`;

  if (isCandles && !candles.length) {
    return <Paper sx={{ p: 2 }}><Typography color="text.secondary">No transfers for this selection and time range.</Typography></Paper>;
  }

  const tickCount = Math.min(5, last.day - first.day + 1);
  const ticks = Array.from({ length: tickCount }, (_, index) =>
    first.day + Math.round(index * (last.day - first.day) / Math.max(1, tickCount - 1)),
  );
  const tickDate = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: first.date.slice(0, 4) === last.date.slice(0, 4) ? undefined : "2-digit",
    timeZone: "UTC",
  });
  const [lowest, highest] = points.reduce(([min, max], point) => [
    Math.min(min, isCandles ? point.low : point.close),
    Math.max(max, isCandles ? point.high : point.close),
  ], [first.open, first.open]);
  const smallestUnit = 10 ** -fractionDigits;
  const padding = (highest - lowest) * 0.08 || Math.max(Math.abs(highest) * 0.05, smallestUnit);
  const paddedLow = lowest - padding;
  const paddedHigh = highest + padding;
  const balanceResolution = Math.max(Math.abs(paddedLow), Math.abs(paddedHigh)) * Number.EPSILON;
  // Aim for five intervals, rounding the step up to a multiple of 1, 2, or 5 at its decimal scale.
  const targetStep = Math.max((paddedHigh - paddedLow) / 5, smallestUnit, balanceResolution);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const scaledStep = targetStep / magnitude;
  const balanceStep = (scaledStep <= 1 ? 1 : scaledStep <= 2 ? 2 : scaledStep <= 5 ? 5 : 10) * magnitude;
  const firstBalanceTick = Math.floor(paddedLow / balanceStep);
  const lastBalanceTick = Math.ceil(paddedHigh / balanceStep);
  const balanceTicks = Array.from({ length: lastBalanceTick - firstBalanceTick + 1 }, (_, index) =>
    (firstBalanceTick + index) * balanceStep,
  );
  const xAxis = (
    <XAxis
      dataKey="day"
      type="number"
      scale="linear"
      domain={[first.day - 0.5, last.day + 0.5]}
      allowDataOverflow
      ticks={ticks}
      tickFormatter={(day: number) => tickDate.format(day * millisecondsPerDay)}
    />
  );
  const yAxis = (
    <YAxis
      dataKey="close"
      type="number"
      domain={[balanceTicks[0], balanceTicks[balanceTicks.length - 1]]}
      allowDataOverflow
      ticks={balanceTicks}
      width={balanceAxisWidth}
      tickMargin={balanceTickMargin}
      tickSize={balanceTickSize}
      tickFormatter={formatBalance.format}
      tick={<BalanceAxisTick onMeasure={measureBalanceTick} />}
    />
  );
  const tooltip = (
    <Tooltip trigger={touchInput ? "click" : "hover"} content={({ active, payload }) => {
      const day: BalanceDay | undefined = payload?.[0]?.payload;
      if (!active || !day) return null;
      return (
        <Paper elevation={4} sx={{ p: 1.5 }}>
          <Typography variant="subtitle2">{fullDate.format(calendarDay(day.date) * millisecondsPerDay)}</Typography>
          {isCandles ? (
            <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto auto", m: 0, columnGap: 2, fontSize: 14, "& dd": { m: 0, textAlign: "end" } }}>
              <dt>Open</dt><dd>{formatAmount(day.open)}</dd>
              <dt>Close</dt><dd>{formatAmount(day.close)}</dd>
              <dt>High</dt><dd>{formatAmount(day.high)}</dd>
              <dt>Low</dt><dd>{formatAmount(day.low)}</dd>
              <dt>Change</dt><dd>{formatChange.format(day.close - day.open)}{unit ? ` ${unit.symbol}` : ""}</dd>
            </Box>
          ) : (
            <Typography variant="body2">Balance {formatAmount(day.close)}</Typography>
          )}
        </Paper>
      );
    }} />
  );
  const drawCandle = (props: unknown) => {
    const { cx, payload, xAxis, yAxis } = props as CandleShapeProps;
    const dayWidth = Math.abs(xAxis.scale(payload.day + 1) - cx);
    const width = Math.max(1, Math.min(18, dayWidth * 0.68));
    const hitWidth = Math.min(24, dayWidth);
    const open = yAxis.scale(payload.open);
    const close = yAxis.scale(payload.close);
    const high = yAxis.scale(payload.high);
    const low = yAxis.scale(payload.low);
    const color = payload.close > payload.open ? theme.palette.success.main
      : payload.close < payload.open ? theme.palette.error.main : theme.palette.text.secondary;
    return (
      <g data-candle-day={payload.date} aria-label={`${payload.date}, open ${formatAmount(payload.open)}, close ${formatAmount(payload.close)}`}>
        <rect x={cx - hitWidth / 2} y={high - 5} width={hitWidth} height={Math.max(10, low - high + 10)} fill="transparent" />
        <line x1={cx} x2={cx} y1={high} y2={low} stroke={color} />
        <rect x={cx - width / 2} y={Math.min(open, close)} width={width} height={Math.max(2, Math.abs(open - close))} fill={color} />
      </g>
    );
  };
  const lineData = [
    { ...first, day: first.day - 0.5, close: first.open },
    ...points,
    { ...last, day: last.day + 0.5 },
  ];

  return (
    <Paper sx={{ p: { xs: 1, sm: 2 }, height: 360, overflowX: "auto" }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={balanceAxisWidth + 120}>
        {isCandles ? (
          <ScatterChart margin={{ top: 10, right: 16, bottom: 4 }}>
            <CartesianGrid stroke={theme.palette.divider} vertical={false} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Scatter data={candles} shape={drawCandle} activeShape={drawCandle} isAnimationActive={false} />
          </ScatterChart>
        ) : (
          <LineChart data={lineData} margin={{ top: 10, right: 16, bottom: 4 }} accessibilityLayer>
            <CartesianGrid stroke={theme.palette.divider} vertical={false} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Line dataKey="close" type="stepAfter" stroke={theme.palette.primary.main} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </Paper>
  );
}
