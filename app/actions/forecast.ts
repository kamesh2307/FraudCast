"use server";
// FraudCast – server actions behind the "Run forecast" buttons.
// They run on the server only, so the database key never reaches the browser.

import { revalidatePath } from "next/cache";
import { runAndSaveForecasts } from "../../lib/forecast-data";

export async function runCaseForecast(formData: FormData): Promise<void> {
  const id = String(formData.get("case_id") ?? "");
  if (!/^SYN-CASE-\d{4}$/.test(id)) throw new Error("Invalid case ID.");
  await runAndSaveForecasts([id], "Analyst ran forecast for this case");
  revalidatePath("/", "layout");
}

export async function runAllForecasts(): Promise<void> {
  await runAndSaveForecasts(null, "Batch forecast run for all cases");
  revalidatePath("/", "layout");
}
