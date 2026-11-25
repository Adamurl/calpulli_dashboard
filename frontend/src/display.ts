const missingText = new Set(["", "n/a", "not applicable", "not provided"]);

export function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return missingText.has(trimmed.toLowerCase()) ? null : trimmed;
}

export function formatClientPhone(phone: string) {
  if (!/^\+?[\d().\s-]+$/.test(phone)) return phone;

  const digits = phone.replace(/\D/g, "");
  const number = digits.match(/^(?:1)?(\d{3})(\d{3})(\d{4})$/);
  if (!number || (phone.startsWith("+") && digits.length !== 11)) return phone;

  return `+1 (${number[1]}) ${number[2]} - ${number[3]}`;
}
