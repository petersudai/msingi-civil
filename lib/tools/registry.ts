import {
  Activity,
  Building2,
  Grid3x3,
  Layers,
  type LucideIcon,
  Mountain,
  RectangleHorizontal,
  RectangleVertical,
  Triangle,
  Wind,
} from "lucide-react";

/**
 * The tool registry: the single source of truth for what tools exist.
 *
 * Navigation, the home screen, saved-calculation records and PDF headers all
 * read from here. Adding a tool means one entry here, one engine folder in
 * `lib/calculations/`, one route under `app/tools/`, and nothing else changes.
 */

export type ToolCategory =
  | "materials"
  | "structural"
  | "loading"
  | "geotechnical"
  | "workflow";

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  materials: "Materials & quantities",
  structural: "Structural checks",
  loading: "Loading",
  geotechnical: "Geotechnical",
  workflow: "Workflows",
};

export interface ToolDefinition {
  /** Stable identifier; also the route segment and saved-calc key. */
  slug: string;
  name: string;
  /** One line: what it does, in the user's words. */
  description: string;
  category: ToolCategory;
  icon: LucideIcon;
  status: "available" | "coming-soon";
  /** Build phase, for roadmap ordering on the home screen. */
  phase: number;
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    slug: "concrete-materials",
    name: "Concrete materials",
    description:
      "Cement bags, sand and ballast tonnage for any volume and mix class.",
    category: "materials",
    icon: Layers,
    status: "available",
    phase: 1,
  },
  {
    slug: "rebar-takeoff",
    name: "Rebar takeoff",
    description:
      "Total steel weight, cut lengths and a bar bending schedule per member.",
    category: "materials",
    icon: Grid3x3,
    status: "coming-soon",
    phase: 2,
  },
  {
    slug: "beam-design",
    name: "RC beam check",
    description:
      "Flexural steel required and shear capacity check for a given section.",
    category: "structural",
    icon: RectangleHorizontal,
    status: "coming-soon",
    phase: 3,
  },
  {
    slug: "column-design",
    name: "RC column check",
    description:
      "Axial and combined axial-moment capacity with slenderness checks.",
    category: "structural",
    icon: RectangleVertical,
    status: "coming-soon",
    phase: 4,
  },
  {
    slug: "truss-analysis",
    name: "Truss analysis",
    description:
      "Member forces for determinate plane trusses by the method of joints.",
    category: "structural",
    icon: Triangle,
    status: "coming-soon",
    phase: 5,
  },
  {
    slug: "wind-loading",
    name: "Wind loading",
    description: "Design wind pressures and member loads for simple buildings.",
    category: "loading",
    icon: Wind,
    status: "coming-soon",
    phase: 6,
  },
  {
    slug: "seismic-loading",
    name: "Seismic loading",
    description: "Equivalent static base shear and storey force distribution.",
    category: "loading",
    icon: Activity,
    status: "coming-soon",
    phase: 7,
  },
  {
    slug: "bearing-capacity",
    name: "Bearing capacity",
    description:
      "Allowable soil bearing pressure from standard soil parameters.",
    category: "geotechnical",
    icon: Mountain,
    status: "coming-soon",
    phase: 8,
  },
  {
    slug: "whole-structure",
    name: "Whole structure",
    description:
      "Guided flow chaining the tools into one combined report for a small frame building.",
    category: "workflow",
    icon: Building2,
    status: "coming-soon",
    phase: 9,
  },
] as const;

export function getTool(slug: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolHref(tool: ToolDefinition): string {
  return `/tools/${tool.slug}`;
}

/** Tools grouped by category, preserving category order. */
export function toolsByCategory(): Array<{
  category: ToolCategory;
  label: string;
  tools: ToolDefinition[];
}> {
  const order: ToolCategory[] = [
    "materials",
    "structural",
    "loading",
    "geotechnical",
    "workflow",
  ];
  return order
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      tools: TOOLS.filter((t) => t.category === category),
    }))
    .filter((g) => g.tools.length > 0);
}
