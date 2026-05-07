import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyReport } from "@/api";

const monthlySpendChartConfig = {
  primary: {
    label: "Solo personal",
    color: "var(--primary)",
  },
  secondary: {
    label: "My shared share",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export type SpendLens = "me" | "shared" | "partner";

export function MonthlySpendChart(props: {
  lens: SpendLens;
  onMonthSelect: (month: string) => void;
  reports: MonthlyReport[];
}) {
  const chartConfig = chartConfigForLens(props.lens);
  const data = props.reports.map((report) =>
    dataPointForLens(report, props.lens),
  );

  return (
    <ChartContainer
      className="h-[210px] w-full [&_.recharts-bar-rectangle]:cursor-pointer"
      config={chartConfig}
    >
      <BarChart
        accessibilityLayer
        data={data}
        onClick={(state) => {
          const month = clickedMonthFromChartState(state);

          if (month) {
            props.onMonthSelect(month);
          }
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="monthLabel"
          tickLine={false}
          tickMargin={10}
        />
        <YAxis
          axisLine={false}
          tickFormatter={formatCurrencyAxisTick}
          tickLine={false}
          tickMargin={8}
          width={54}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <>
                  <span className="text-muted-foreground">
                    {chartConfig[name as keyof typeof chartConfig]?.label ??
                      name}
                  </span>
                  <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                    {formatCurrencyFromMajorUnits(Number(value))}
                  </span>
                </>
              )}
            />
          }
        />
        <Bar
          dataKey="primary"
          fill="var(--color-primary)"
          radius={[4, 4, 0, 0]}
          stackId="spend"
        />
        <Bar
          dataKey="secondary"
          fill="var(--color-secondary)"
          radius={[4, 4, 0, 0]}
          stackId="spend"
        />
      </BarChart>
    </ChartContainer>
  );
}

function chartConfigForLens(lens: SpendLens): ChartConfig {
  if (lens === "shared") {
    return {
      primary: {
        label: "Your share",
        color: "var(--primary)",
      },
      secondary: {
        label: "Partner / other share",
        color: "var(--chart-2)",
      },
    };
  }

  if (lens === "partner") {
    return {
      primary: {
        label: "Partner-specific",
        color: "var(--primary)",
      },
      secondary: {
        label: "Other shared share",
        color: "var(--chart-2)",
      },
    };
  }

  return monthlySpendChartConfig;
}

function dataPointForLens(report: MonthlyReport, lens: SpendLens) {
  if (lens === "shared") {
    return {
      monthKey: report.month,
      monthLabel: formatMonthShort(report.month),
      primary: minorUnitsToMajorUnits(report.sharedSpendMyShareMinorUnits),
      secondary: minorUnitsToMajorUnits(report.sharedSpendOtherShareMinorUnits),
    };
  }

  if (lens === "partner") {
    return {
      monthKey: report.month,
      monthLabel: formatMonthShort(report.month),
      primary: minorUnitsToMajorUnits(report.partnerSpendMinorUnits),
      secondary: minorUnitsToMajorUnits(
        Math.max(
          0,
          report.sharedSpendOtherShareMinorUnits -
            report.partnerSpendMinorUnits,
        ),
      ),
    };
  }

  return {
    monthKey: report.month,
    monthLabel: formatMonthShort(report.month),
    primary: minorUnitsToMajorUnits(report.soloPersonalSpendMinorUnits),
    secondary: minorUnitsToMajorUnits(report.sharedSpendMyShareMinorUnits),
  };
}

function clickedMonthFromChartState(state: unknown): string | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }

  const activePayload = (state as { activePayload?: unknown }).activePayload;
  if (!Array.isArray(activePayload)) {
    return null;
  }

  const firstPayload = activePayload[0];
  if (typeof firstPayload !== "object" || firstPayload === null) {
    return null;
  }

  const payload = (firstPayload as { payload?: unknown }).payload;
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const monthKey = (payload as { monthKey?: unknown }).monthKey;
  return typeof monthKey === "string" ? monthKey : null;
}

function formatCurrencyFromMajorUnits(amountMajorUnits: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountMajorUnits);
}

function formatCurrencyAxisTick(amountMajorUnits: number): string {
  if (Math.abs(amountMajorUnits) >= 1000) {
    return `£${Math.round(amountMajorUnits / 1000)}k`;
  }

  return `£${Math.round(amountMajorUnits)}`;
}

function formatMonthShort(month: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function minorUnitsToMajorUnits(amountMinorUnits: number): number {
  return amountMinorUnits / 100;
}
