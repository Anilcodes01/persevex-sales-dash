import { HttpError } from "../http/helpers";
export function rupeesToPaise(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value.trim()))
    throw new HttpError(
      400,
      `${label} must be a positive INR amount with up to two decimal places`,
    );
  const [whole, fraction = ""] = value.trim().split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (paise <= 0)
    throw new HttpError(400, `${label} must be greater than zero`);
  return paise;
}
