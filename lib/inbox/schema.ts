import { z } from "zod";

export const scopeSchema = z.enum(["production", "activity"]);

export const navIdSchema = z.enum([
  "projects",
  "activity",
  "usage",
  "people",
  "general",
  "plans",
  "billing",
  "audit",
  "workspace",
  "pinned",
  "servers",
  "team",
  "logs",
  "settings",
]);

export const statusSchema = z.enum([
  "ready",
  "running",
  "building",
  "failed",
  "queued",
  "idle",
  "stopped",
]);

export const targetSchema = z.enum(["web", "server", "worker"]);

export const serviceSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  detail: z.string().trim().min(1),
  time: z.string().trim().min(1),
  scope: scopeSchema,
  status: statusSchema,
  pinned: z.boolean(),
  target: targetSchema,
  mark: z.string().trim().min(1).max(2),
  color: z.string().trim().min(1),
  order: z.number(),
});

export const servicesSchema = z.array(serviceSchema);

export const usageSchema = z.object({
  model: z.string().trim().min(1),
  plan: z.string().trim().min(1),
  ratio: z.number().min(0).max(1),
});

/** Matches POST /v1/projects: any non-empty trimmed name. */
export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Name the project.")
  .max(80, "Use 80 characters or fewer.");

export const serviceNameSchema = projectNameSchema;

export const deploySchema = z.object({
  name: serviceNameSchema,
  repository: z.string().trim().min(1, "Add a repository."),
  region: z.string().trim().min(1, "Choose a region."),
});

export type Service = z.infer<typeof serviceSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type NavId = z.infer<typeof navIdSchema>;
export type ServiceStatus = z.infer<typeof statusSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type DeployInput = z.infer<typeof deploySchema>;
