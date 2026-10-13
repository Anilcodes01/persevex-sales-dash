"use client";
import { useState, type ChangeEvent } from "react";
import type { DropdownProps } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Date-only values must not pass through UTC conversion, which can shift the day.
function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function CalendarDropdown({
  value,
  onChange,
  options,
  disabled,
  "aria-label": label,
}: DropdownProps) {
  return (
    <Select
      value={String(value)}
      disabled={disabled}
      onValueChange={(next) => {
        // DayPicker's navigation handler consumes only target.value.
        onChange?.({
          target: { value: next },
        } as ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectTrigger className="h-8 w-auto gap-2 text-sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function DatePicker({
  value,
  onChange,
  min = "2000-01-01",
  max = "2099-12-31",
  required = false,
  "aria-label": label = "Choose date",
}: {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  required?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDate(value) : undefined;
  const display = selected?.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="date-picker-trigger"
          aria-label={`${label}${display ? `: ${display}` : ""}`}
        >
          <CalendarDays size={16} />
          {display || "Select date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? parseDate(min)}
          required={required}
          captionLayout="dropdown"
          components={{ Dropdown: CalendarDropdown }}
          startMonth={parseDate(min)}
          endMonth={parseDate(max)}
          disabled={[{ before: parseDate(min) }, { after: parseDate(max) }]}
          onSelect={(date: Date | undefined) => {
            if (date) {
              onChange({ target: { value: dateValue(date) } });
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
