import { Hono } from "hono";
import { z } from "zod";

import { fileImportSources } from "@personal-finance/core";
import type { ImportsService } from "../services/imports-service";

const importSourceSchema = z.enum(fileImportSources);

export function createImportsRoutes(importsService: ImportsService) {
  const routes = new Hono();

  routes.get("/imports", (context) =>
    context.json(importsService.listImportedFiles()),
  );

  routes.post("/imports/preview", async (context) => {
    const csvImport = await parseCsvImportForm(context.req.raw);

    if (!csvImport.success) {
      return context.json({ error: csvImport.error }, 400);
    }

    try {
      return context.json(importsService.previewCsvImport(csvImport.data));
    } catch (error) {
      if (error instanceof Error) {
        return context.json({ error: error.message }, 400);
      }

      throw error;
    }
  });

  routes.post("/imports", async (context) => {
    const csvImport = await parseCsvImportForm(context.req.raw);

    if (!csvImport.success) {
      return context.json({ error: csvImport.error }, 400);
    }

    try {
      return context.json(importsService.importCsv(csvImport.data), 201);
    } catch (error) {
      if (error instanceof Error) {
        return context.json({ error: error.message }, 400);
      }

      throw error;
    }
  });

  return routes;
}

async function parseCsvImportForm(request: Request) {
  const form = await request.formData();
  const source = importSourceSchema.safeParse(form.get("source"));
  const file = form.get("file");

  if (!source.success) {
    return { success: false as const, error: "Invalid import source." };
  }

  if (!(file instanceof File)) {
    return { success: false as const, error: "CSV file is required." };
  }

  if (file.size === 0) {
    return { success: false as const, error: "CSV file is empty." };
  }

  return {
    success: true as const,
    data: {
      csv: await file.text(),
      originalFileName: file.name || "uploaded.csv",
      source: source.data,
    },
  };
}
