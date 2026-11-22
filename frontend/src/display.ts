const missingText = new Set(["", "n/a", "not applicable", "not provided"]);

export function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return missingText.has(trimmed.toLowerCase()) ? null : trimmed;
}
